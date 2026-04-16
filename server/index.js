import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your_super_secret_jwt_key_123'; // In production, move to .env

// Middleware
app.use(cors());
app.use(express.json());

// Request logging for troubleshooting
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
  
  if (!token) return res.status(401).json({ error: 'Access Denied: No Token Provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Access Denied: Invalid Token' });
    req.user = user;
    next();
  });
};

// ─── AUTHENTICATION ROUTES ─────────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(201).json({ success: true, message: 'User registered successfully!' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Encryption error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(400).json({ error: 'Cannot find user' });

    try {
      if (await bcrypt.compare(password, user.password)) {
        // Sign JWT payload across 2 hours lifecycle
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ success: true, token, username: user.username });
      } else {
        res.status(401).json({ error: 'Incorrect password' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Authentication internal failure' });
    }
  });
});

// ─── PAYMENT API ROUTES ────────────────────────────────────────────────────

// POST a new transaction (Open so DApp can record automatically)
app.post('/api/transactions', (req, res) => {
  const { tx_hash, sender, receiver, amount } = req.body;

  if (!tx_hash || !sender || !receiver || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const query = `INSERT INTO transactions (tx_hash, sender, receiver, amount) VALUES (?, ?, ?, ?)`;
  db.run(query, [tx_hash, sender, receiver, amount], function(err) {
    if (err) return res.status(500).json({ error: `Database insertion failed: ${err.message}` });
    res.status(201).json({ success: true, message: 'Transaction saved to database', id: this.lastID });
  });
});

// GET transaction analytics for Dashboard (PROTECTED)
app.get('/api/stats', authenticateToken, (req, res) => {
  const query = `SELECT * FROM transactions ORDER BY timestamp DESC`;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database fetch failed' });
    res.status(200).json({ success: true, data: rows });
  });
});

// ─── P2P PAYMENT REQUEST ROUTES ────────────────────────────────────────

// Create a new Payment Request
app.post('/api/requests', (req, res) => {
  const { requester, target, amount, memo } = req.body;
  if (!requester || !target || !amount) {
    return res.status(400).json({ error: 'Missing requester, target or amount' });
  }

  const query = `INSERT INTO requests (requester, target, amount, memo) VALUES (?, ?, ?, ?)`;
  db.run(query, [requester, target, amount, memo], function(err) {
    if (err) return res.status(500).json({ error: 'Failed inserting request' });
    res.status(201).json({ success: true, message: 'Request created', id: this.lastID });
  });
});

// Fetch pending requests for a specific wallet address
app.get('/api/requests/:target', (req, res) => {
  const target = req.params.target;
  const query = `SELECT * FROM requests WHERE target = ? AND status = 'pending' ORDER BY timestamp DESC`;
  db.all(query, [target], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database fetch failed' });
    res.status(200).json({ success: true, data: rows });
  });
});

// Mark a request as paid
app.put('/api/requests/:id/pay', (req, res) => {
  const id = req.params.id;
  db.run(`UPDATE requests SET status = 'paid' WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: 'Database update failed' });
    res.status(200).json({ success: true, message: 'Request recorded as paid' });
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend Database API is securely running on http://0.0.0.0:${PORT}`);
});

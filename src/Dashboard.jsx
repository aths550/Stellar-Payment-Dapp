import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

function Dashboard() {
  const [txData, setTxData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mouseY, setMouseY] = useState(null);
  const navigate = useNavigate();

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch('http://localhost:3001/api/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUsername');
        navigate('/login');
        return;
      }
      
      if (!response.ok) throw new Error('Backend failed to load datastream');
      const payload = await response.json();
      
      // Map database rows to what Recharts expects & preserve full data for the table
      const formatted = payload.data.map(tx => {
        const dateObj = new Date(tx.timestamp);
        return {
          id: tx.id,
          time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          amount: parseFloat(tx.amount),
          hash: tx.tx_hash.slice(0, 8) + '...',
          
          // Full fields for table
          tx_hash: tx.tx_hash,
          sender: tx.sender,
          receiver: tx.receiver,
          fullDate: dateObj.toLocaleString(),
        };
      }).reverse(); // Chronological order (oldest -> newest for recharts)

      // Ensure there's dummy data if there are no real transactions yet so graphics still show
      if (formatted.length === 0) {
        setTxData([
          { time: '10:00', amount: 10, tx_hash: 'placeholder', sender: '-', receiver: '-', fullDate: '-' },
          { time: '10:05', amount: 15, tx_hash: 'placeholder', sender: '-', receiver: '-', fullDate: '-' },
          { time: '10:10', amount: 35, tx_hash: 'placeholder', sender: '-', receiver: '-', fullDate: '-' },
          { time: '10:15', amount: 20, tx_hash: 'placeholder', sender: '-', receiver: '-', fullDate: '-' },
          { time: '10:20', amount: 50, tx_hash: 'placeholder', sender: '-', receiver: '-', fullDate: '-' },
        ]);
      } else {
        setTxData(formatted);
      }
    } catch (err) {
      console.error(err);
      setError(`Backend Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Simulate real-time polling
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalVolume = txData.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2);
  const tableData = [...txData].reverse().filter(t => t.tx_hash !== 'placeholder'); // newest first for table

  return (
    <div className="app-page">
      {/* 3D Background Decoration */}
      <div className="bg-3d-container">
        <div className="shape-3d sphere-1"></div>
        <div className="shape-3d sphere-2"></div>
      </div>

      <div className="container" style={{ maxWidth: '900px' }}>
        
        {/* Navigation Header */}
        <header className="header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className="title">System Dashboard</h1>
            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#d8b4fe', borderColor: '#a855f7' }}>Live</span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link to="/" className="btn btn-blue" style={{ width: 'auto', textDecoration: 'none' }}>
              ← Payment
            </Link>
            <button 
              className="btn" 
              style={{ width: 'auto', padding: '0 16px', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)' }}
              onClick={() => {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminUsername');
                navigate('/login');
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <div className="glass-card status-error">
            <h2 className="card-title">Backend Connection Refused</h2>
            <p className="status-text">{error}</p>
            <p className="status-text" style={{fontSize: '11px', marginTop: '10px'}}>Did you run `npm run server`?</p>
          </div>
        ) : loading ? (
          <div className="glass-card" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <svg className="spinner" style={{ width: '40px', height: '40px', color: '#60a5fa' }} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div style={{ animation: 'fadeUpStagger 0.6s ease forwards' }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div className="glass-card" style={{ marginBottom: 0 }}>
                <h3 className="info-label" style={{ marginTop: 0 }}>Total Volume (XLM)</h3>
                <p className="title" style={{ fontSize: '32px' }}>{totalVolume}</p>
              </div>
              <div className="glass-card" style={{ marginBottom: 0 }}>
                <h3 className="info-label" style={{ marginTop: 0 }}>Transactions Tracked</h3>
                <p className="title" style={{ fontSize: '32px', backgroundImage: 'linear-gradient(to right, #34d399, #10b981)' }}>
                  {tableData.length}
                </p>
              </div>
            </div>

            {/* High Graphics Area Chart */}
            <div className="glass-card">
              <h2 className="card-title">Transaction Volume Timeline</h2>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <AreaChart 
                    data={txData} 
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onMouseMove={(e) => {
                      if (e && typeof e.chartY === 'number') {
                        setMouseY(e.chartY);
                      }
                    }}
                    onMouseLeave={() => setMouseY(null)}
                  >
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      position={mouseY !== null ? { y: Math.max(0, mouseY - 30) } : undefined}
                      contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#a78bfa" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" activeDot={{ r: 8, fill: '#ddd6fe', strokeWidth: 0, stroke: 'none' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Events / Hash Matrix */}
            <div className="glass-card" style={{ animationDelay: '0.2s', marginBottom: '20px' }}>
              <h2 className="card-title">Event Matrix</h2>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={txData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                         <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="hash" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                      contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '12px' }}
                    />
                    <Bar dataKey="amount" fill="url(#colorBar)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Comprehensive Table */}
            <div className="glass-card" style={{ animationDelay: '0.3s' }}>
              <h2 className="card-title">Indexed Transaction Ledger</h2>
              <div className="table-container">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Sender</th>
                      <th>Receiver</th>
                      <th>Amount</th>
                      <th>Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', opacity: 0.5 }}>No recorded transactions yet.</td>
                      </tr>
                    ) : (tableData.map((row) => (
                      <tr key={row.id}>
                        <td>{row.fullDate}</td>
                        <td><span className="mono-text" title={row.sender}>{row.sender.slice(0, 5)}...{row.sender.slice(-5)}</span></td>
                        <td><span className="mono-text" title={row.receiver}>{row.receiver.slice(0, 5)}...{row.receiver.slice(-5)}</span></td>
                        <td style={{ color: '#34d399', fontWeight: 'bold' }}>{row.amount} XLM</td>
                        <td><a href={`https://stellar.expert/explorer/testnet/tx/${row.tx_hash}`} target="_blank" rel="noopener noreferrer" className="explorer-link">{row.hash}</a></td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

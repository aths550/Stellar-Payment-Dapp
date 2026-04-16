import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setStatus({ message: 'Username and password are required', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatus({ message: '', type: '' });

    const endpoint = isRegistering ? '/api/register' : '/api/login';
    
    try {
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Authentication failed');
      }

      if (isRegistering) {
        setStatus({ message: 'Registration successful! Please log in.', type: 'success' });
        setIsRegistering(false); // flip back to login form
        setPassword('');
      } else {
        // Successful Login
        localStorage.setItem('adminToken', payload.token);
        localStorage.setItem('adminUsername', payload.username);
        navigate('/dashboard');
      }
    } catch (err) {
      setStatus({ message: err.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setStatus({ message: '', type: '' });
    setPassword('');
  };

  return (
    <div className="app-page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      {/* 3D Background Decoration */}
      <div className="bg-3d-container">
        <div className="shape-3d sphere-1"></div>
        <div className="shape-3d sphere-2"></div>
      </div>
      
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', animation: 'fadeUpStagger 0.4s ease forwards' }}>
        <h2 className="title" style={{ textAlign: 'center', marginBottom: '24px' }}>
          {isRegistering ? 'Create Account' : 'Admin Login'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field">
            <label className="field-label">Username</label>
            <input
              className="input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="field">
            <label className="field-label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button 
            type="submit" 
            className={`btn btn-blue ${isLoading ? 'btn-disabled' : ''}`}
            disabled={isLoading}
            style={{ marginTop: '8px' }}
          >
            {isLoading ? 'Processing...' : (isRegistering ? 'Register' : 'Log In')}
          </button>
        </form>

        {status.message && (
          <div className={`status-card ${status.type === 'error' ? 'status-error' : 'status-success'}`} style={{ marginTop: '20px', padding: '12px', fontSize: '13px' }}>
            {status.message}
          </div>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}
          <button 
            onClick={toggleMode}
            style={{ background: 'none', border: 'none', color: '#60a5fa', fontWeight: 'bold', marginLeft: '6px', cursor: 'pointer', outline: 'none' }}
          >
            {isRegistering ? 'Log in here' : 'Register here'}
          </button>
        </div>
        
      </div>

      <Link to="/" className="explorer-link" style={{ marginTop: '24px', color: '#6b7280', borderBottomColor: '#4b5563' }}>
        ← Return to DApp
      </Link>
    </div>
  );
}

export default Login;

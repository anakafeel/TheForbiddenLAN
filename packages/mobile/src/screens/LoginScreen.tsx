// Login screen — username/password → POST /auth/login → store JWT
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setJwt = useStore(s => s.setJwt);

  const login = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      setJwt(data.jwt);
      navigate('/ptt');
    } catch {
      setError('Cannot reach server');
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:16 }}>
      <h1 style={{ fontSize:32, fontWeight:'bold' }}>SkyTalk</h1>
      <input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}
        style={{ padding:12, fontSize:16, width:280, borderRadius:8, border:'1px solid #ccc' }} />
      <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}
        style={{ padding:12, fontSize:16, width:280, borderRadius:8, border:'1px solid #ccc' }} />
      {error && <p style={{ color:'red' }}>{error}</p>}
      <button onClick={login}
        style={{ padding:'14px 40px', fontSize:18, backgroundColor:'#0D6EFD', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
        Connect
      </button>
    </div>
  );
}

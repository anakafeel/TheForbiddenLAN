import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Devices } from './pages/Devices';
import { Talkgroups } from './pages/Talkgroups';
import { Users } from './pages/Users';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display:'flex', height:'100vh', fontFamily:'Arial, sans-serif' }}>
        <nav style={{ width:200, backgroundColor:'#0A1628', color:'white', padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <h2 style={{ color:'#0D6EFD', marginBottom:16 }}>ForbiddenLAN Admin</h2>
          <a href="/dashboard" style={{ color:'white', textDecoration:'none' }}>📊 Dashboard</a>
          <a href="/devices"   style={{ color:'white', textDecoration:'none' }}>📡 Devices</a>
          <a href="/talkgroups"style={{ color:'white', textDecoration:'none' }}>🎙 Talkgroups</a>
          <a href="/users"     style={{ color:'white', textDecoration:'none' }}>👥 Users</a>
        </nav>
        <main style={{ flex:1, padding:24, overflowY:'auto', backgroundColor:'#F8F9FA' }}>
          <Routes>
            <Route path="/"            element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/devices"     element={<Devices />} />
            <Route path="/talkgroups"  element={<Talkgroups />} />
            <Route path="/users"       element={<Users />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

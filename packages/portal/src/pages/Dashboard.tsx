// System status overview — devices online, data usage, active talkgroups
import { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function Dashboard() {
  const [devices, setDevices] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API}/devices`, { headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` } })
      .then(r => r.json()).then(setDevices).catch(() => {});
  }, []);
  return (
    <div>
      <h1 style={{ color:'#0A1628' }}>System Dashboard</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginTop:16 }}>
        <StatCard label="Devices Online" value={devices.filter(d=>d.active).length} />
        <StatCard label="Total Devices"  value={devices.length} />
        <StatCard label="Active Talkgroups" value="—" />
      </div>
      <h2 style={{ marginTop:32 }}>Device Status</h2>
      <table style={{ width:'100%', borderCollapse:'collapse', marginTop:8 }}>
        <thead><tr style={{ backgroundColor:'#1E3A5F', color:'white' }}>
          <th style={{ padding:10, textAlign:'left' }}>Name</th>
          <th style={{ padding:10, textAlign:'left' }}>Site</th>
          <th style={{ padding:10, textAlign:'left' }}>Status</th>
        </tr></thead>
        <tbody>{devices.map((d,i) => (
          <tr key={d.id} style={{ backgroundColor: i%2===0?'#EBF4FD':'white' }}>
            <td style={{ padding:10 }}>{d.name}</td>
            <td style={{ padding:10 }}>{d.site}</td>
            <td style={{ padding:10, color: d.active?'green':'red' }}>{d.active?'Online':'Offline'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
function StatCard({ label, value }: { label:string; value:any }) {
  return (
    <div style={{ backgroundColor:'white', borderRadius:8, padding:20, boxShadow:'0 2px 8px #0002' }}>
      <p style={{ color:'#666', fontSize:13, margin:0 }}>{label}</p>
      <p style={{ fontSize:28, fontWeight:'bold', margin:'8px 0 0', color:'#0A1628' }}>{value}</p>
    </div>
  );
}

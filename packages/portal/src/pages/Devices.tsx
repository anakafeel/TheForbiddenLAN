// Device management — activate / deactivate devices
import { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const jwt = () => localStorage.getItem('jwt') ?? '';

export function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const load = () => fetch(`${API}/devices`, { headers:{Authorization:`Bearer ${jwt()}`} })
    .then(r=>r.json()).then(setDevices).catch(()=>{});
  useEffect(()=>{ load(); }, []);
  const toggle = async (id:string, active:boolean) => {
    await fetch(`${API}/devices/${id}/status`, { method:'PATCH',
      headers:{ Authorization:`Bearer ${jwt()}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ active }) });
    load();
  };
  return (
    <div>
      <h1>Devices</h1>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ backgroundColor:'#1E3A5F', color:'white' }}>
          <th style={{ padding:10, textAlign:'left' }}>Serial</th>
          <th style={{ padding:10, textAlign:'left' }}>Name</th>
          <th style={{ padding:10, textAlign:'left' }}>Site</th>
          <th style={{ padding:10, textAlign:'left' }}>Actions</th>
        </tr></thead>
        <tbody>{devices.map((d,i)=>(
          <tr key={d.id} style={{ backgroundColor:i%2===0?'#EBF4FD':'white' }}>
            <td style={{ padding:10 }}>{d.serial}</td>
            <td style={{ padding:10 }}>{d.name}</td>
            <td style={{ padding:10 }}>{d.site}</td>
            <td style={{ padding:10 }}>
              <button onClick={()=>toggle(d.id, !d.active)}
                style={{ padding:'6px 14px', backgroundColor:d.active?'#E74C3C':'#2ECC71',
                  color:'white', border:'none', borderRadius:6, cursor:'pointer' }}>
                {d.active ? 'Disable' : 'Enable'}
              </button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

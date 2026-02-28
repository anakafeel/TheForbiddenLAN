// Talkgroup management — create talkgroups, view members
import { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const jwt = () => localStorage.getItem('jwt') ?? '';

export function Talkgroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [name, setName]     = useState('');
  const load = () => fetch(`${API}/talkgroups`, { headers:{Authorization:`Bearer ${jwt()}`} })
    .then(r=>r.json()).then(setGroups).catch(()=>{});
  useEffect(()=>{ load(); }, []);
  const create = async () => {
    if (!name.trim()) return;
    await fetch(`${API}/talkgroups`, { method:'POST',
      headers:{ Authorization:`Bearer ${jwt()}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ name }) });
    setName(''); load();
  };
  return (
    <div>
      <h1>Talkgroups</h1>
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="New talkgroup name"
          style={{ padding:10, borderRadius:6, border:'1px solid #ccc', fontSize:15, flex:1 }} />
        <button onClick={create} style={{ padding:'10px 20px', backgroundColor:'#0D6EFD',
          color:'white', border:'none', borderRadius:6, cursor:'pointer' }}>Create</button>
      </div>
      {groups.map(g=>(
        <div key={g.talkgroup_id ?? g.id} style={{ backgroundColor:'white', borderRadius:8,
          padding:16, marginBottom:12, boxShadow:'0 2px 6px #0001' }}>
          <h3 style={{ margin:0 }}>{g.talkgroups?.name ?? g.name}</h3>
        </div>
      ))}
    </div>
  );
}

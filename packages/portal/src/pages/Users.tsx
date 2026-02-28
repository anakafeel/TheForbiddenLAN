// User management — list users, assign roles
import { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const jwt = () => localStorage.getItem('jwt') ?? '';

export function Users() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(()=>{
    fetch(`${API}/users` ?? '', { headers:{Authorization:`Bearer ${jwt()}`} })
      .then(r=>r.json()).then(setUsers).catch(()=>{});
  }, []);
  return (
    <div>
      <h1>Users</h1>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ backgroundColor:'#1E3A5F', color:'white' }}>
          <th style={{ padding:10, textAlign:'left' }}>Username</th>
          <th style={{ padding:10, textAlign:'left' }}>Role</th>
        </tr></thead>
        <tbody>{users.map((u,i)=>(
          <tr key={u.id} style={{ backgroundColor:i%2===0?'#EBF4FD':'white' }}>
            <td style={{ padding:10 }}>{u.username}</td>
            <td style={{ padding:10 }}>{u.role}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

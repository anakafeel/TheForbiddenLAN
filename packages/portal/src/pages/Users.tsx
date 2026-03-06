// User management — list users, assign roles
import { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const jwt = () => localStorage.getItem('jwt') ?? '';

export function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const r = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? `Failed to load users (${r.status})`);
      setUsers(data?.users ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load users');
      setUsers([]);
    }
  };

  useEffect(() => { load(); }, []);

  const removeUser = async (user: any) => {
    if (!user?.id || !user?.username) return;
    if (!window.confirm(`Delete user "${user.username}" from the server?`)) return;

    setError('');
    try {
      const postRemove = await fetch(`${API}/users/${user.id}/remove`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (!postRemove.ok) {
        // Backward compatibility for servers that only support DELETE /users/:id.
        const del = await fetch(`${API}/users/${user.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${jwt()}` },
        });
        if (!del.ok) {
          const delData = await del.json().catch(() => ({}));
          throw new Error(delData?.error ?? `Failed to remove user (${del.status})`);
        }
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to remove user');
    }
  };

  return (
    <div>
      <h1>Users</h1>
      {error ? <div style={{ color: '#B22222', marginBottom: 12 }}>{error}</div> : null}
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ backgroundColor:'#1E3A5F', color:'white' }}>
          <th style={{ padding:10, textAlign:'left' }}>Username</th>
          <th style={{ padding:10, textAlign:'left' }}>Role</th>
          <th style={{ padding:10, textAlign:'left' }}>Actions</th>
        </tr></thead>
        <tbody>{users.map((u,i)=>(
          <tr key={u.id} style={{ backgroundColor:i%2===0?'#EBF4FD':'white' }}>
            <td style={{ padding:10 }}>{u.username}</td>
            <td style={{ padding:10 }}>{u.role}</td>
            <td style={{ padding:10 }}>
              <button
                type="button"
                onClick={() => removeUser(u)}
                style={{
                  background: '#FFE3E3',
                  color: '#B22222',
                  border: '1px solid #B22222',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

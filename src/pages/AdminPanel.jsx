import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPanel({ profile, onLogout }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('users')
  const [form, setForm] = useState({ email:'', password:'', homeName:'', trialDays:30 })
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState({ type:'', text:'' })

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').neq('role','admin').order('created_at', { ascending:false })
    setUsers(data || [])
    setLoading(false)
  }

  async function createUser(e) {
    e.preventDefault()
    setCreating(true); setMsg({ type:'', text:'' })
    try {
      const res = await fetch('/api/create-user', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email:form.email, password:form.password, homeName:form.homeName, trialDays:parseInt(form.trialDays) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMsg({ type:'success', text:`Account created for ${form.homeName}` })
      setForm({ email:'', password:'', homeName:'', trialDays:30 })
      fetchUsers()
      setTimeout(() => setView('users'), 1500)
    } catch(err) {
      setMsg({ type:'error', text:err.message })
    }
    setCreating(false)
  }

  async function toggleSuspend(user) {
    await supabase.from('profiles').update({ is_suspended: !user.is_suspended }).eq('id', user.id)
    fetchUsers()
  }

  async function extendTrial(user, days) {
    const base = user.trial_expires_at && new Date(user.trial_expires_at) > new Date() ? new Date(user.trial_expires_at) : new Date()
    base.setDate(base.getDate() + days)
    await supabase.from('profiles').update({ trial_expires_at: base.toISOString() }).eq('id', user.id)
    fetchUsers()
  }

  function trialStatus(user) {
    if (user.is_suspended) return { label:'Suspended', color:'var(--red)', bg:'var(--red-bg)' }
    if (!user.trial_expires_at) return { label:'No expiry', color:'var(--muted)', bg:'var(--surface2)' }
    const days = Math.ceil((new Date(user.trial_expires_at) - new Date()) / 86400000)
    if (days <= 0) return { label:'Expired', color:'var(--red)', bg:'var(--red-bg)' }
    if (days <= 7) return { label:`${days}d left`, color:'var(--amber)', bg:'var(--amber-bg)' }
    return { label:`${days}d left`, color:'var(--green)', bg:'var(--green-bg)' }
  }

  const s = {
    layout:{ display:'flex', minHeight:'100vh', background:'var(--bg)' },
    sidebar:{ width:220, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'24px 0', position:'sticky', top:0, height:'100vh' },
    main:{ flex:1, padding:32, maxWidth:860 },
    navBtn:(active) => ({ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:'none', borderRadius:'var(--radius-sm)', background: active ? 'var(--surface2)' : 'transparent', borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent', color:'var(--text)', fontSize:14, fontWeight:500, cursor:'pointer', width:'100%', margin:'0 8px', textAlign:'left' }),
    input:{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 14px', color:'var(--text)', fontSize:14, outline:'none', width:'100%' },
    primaryBtn:{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
    card:{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'18px 22px', marginBottom:10 },
  }

  return (
    <div style={s.layout}>
      <aside style={s.sidebar}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 20px', marginBottom:24 }}>
          <div style={{ width:32, height:32, background:'var(--accent)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:12, color:'#fff' }}>CH</div>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:16 }}>Admin</span>
        </div>
        <div style={{ padding:'0 20px', marginBottom:20, fontSize:12, color:'var(--muted)' }}>HBI Consultancy</div>
        <div style={{ flex:1 }}>
          <button onClick={() => setView('users')} style={s.navBtn(view==='users')}>👥 Manage Users</button>
          <button onClick={() => setView('create')} style={s.navBtn(view==='create')}>➕ Create Account</button>
        </div>
        <button onClick={onLogout} style={{ margin:'0 20px', padding:10, border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', background:'transparent', color:'var(--muted)', fontSize:14, cursor:'pointer' }}>Sign out</button>
      </aside>

      <main style={s.main}>
        {view === 'users' && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
              <div>
                <h1 style={{ fontSize:26, fontWeight:700, marginBottom:4 }}>Trial Accounts</h1>
                <p style={{ color:'var(--muted)', fontSize:14 }}>{users.length} account{users.length!==1?'s':''}</p>
              </div>
              <button onClick={() => setView('create')} style={s.primaryBtn}>+ New Account</button>
            </div>
            {loading ? <p style={{ color:'var(--muted)' }}>Loading...</p> : users.length === 0 ? (
              <div style={{ ...s.card, textAlign:'center', color:'var(--muted)', padding:48 }}>
                No accounts yet. <button onClick={() => setView('create')} style={{ ...s.primaryBtn, marginLeft:12 }}>Create first</button>
              </div>
            ) : users.map(user => {
              const st = trialStatus(user)
              return (
                <div key={user.id} style={s.card}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:16, marginBottom:3 }}>{user.home_name}</div>
                      <div style={{ color:'var(--muted)', fontSize:13 }}>{user.email}</div>
                    </div>
                    <div style={{ padding:'3px 12px', borderRadius:20, fontSize:12, fontWeight:600, color:st.color, background:st.bg }}>{st.label}</div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>
                    Created {new Date(user.created_at).toLocaleDateString('en-GB')}
                    {user.trial_expires_at && ` · Expires ${new Date(user.trial_expires_at).toLocaleDateString('en-GB')}`}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {[14,30].map(d => (
                      <button key={d} onClick={() => extendTrial(user,d)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 12px', fontSize:13, color:'var(--text)', cursor:'pointer' }}>+{d} days</button>
                    ))}
                    <button onClick={() => toggleSuspend(user)} style={{ background:'transparent', border:`1px solid ${user.is_suspended ? 'var(--green)' : 'var(--red)'}`, borderRadius:'var(--radius-sm)', padding:'5px 12px', fontSize:13, color: user.is_suspended ? 'var(--green)' : 'var(--red)', cursor:'pointer' }}>
                      {user.is_suspended ? 'Reinstate' : 'Suspend'}
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {view === 'create' && (
          <>
            <h1 style={{ fontSize:26, fontWeight:700, marginBottom:4 }}>Create Trial Account</h1>
            <p style={{ color:'var(--muted)', fontSize:14, marginBottom:28 }}>Set up a new home's compliance account</p>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:32, maxWidth:480 }}>
              <form onSubmit={createUser} style={{ display:'flex', flexDirection:'column', gap:18 }}>
                {[
                  { label:'Home Name', key:'homeName', type:'text', placeholder:'e.g. Sundale Residential' },
                  { label:'Email Address', key:'email', type:'email', placeholder:'manager@home.com' },
                  { label:'Temporary Password', key:'password', type:'text', placeholder:'Min 6 characters' },
                  { label:'Trial Length (days)', key:'trialDays', type:'number', placeholder:'30' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <label style={{ fontSize:12, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</label>
                    <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]:e.target.value }))} placeholder={placeholder} required style={s.input} />
                  </div>
                ))}
                {msg.text && <div style={{ padding:'10px 14px', borderRadius:'var(--radius-sm)', fontSize:14, color: msg.type==='error' ? 'var(--red)' : 'var(--green)', background: msg.type==='error' ? 'var(--red-bg)' : 'var(--green-bg)', border:`1px solid ${msg.type==='error' ? 'var(--red)' : 'var(--green)'}` }}>{msg.text}</div>}
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button type="button" onClick={() => setView('users')} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 20px', fontSize:14, color:'var(--muted)', cursor:'pointer' }}>Cancel</button>
                  <button type="submit" disabled={creating} style={s.primaryBtn}>{creating ? 'Creating...' : 'Create Account'}</button>
                </div>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

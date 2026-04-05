import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:40 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
          <div style={{ width:40, height:40, background:'var(--accent)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:14, color:'#fff' }}>CH</div>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:18 }}>Compliance Hub</span>
        </div>
        <h1 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Welcome back</h1>
        <p style={{ color:'var(--muted)', fontSize:14, marginBottom:28 }}>Sign in to your compliance dashboard</p>
        <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
              style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'11px 14px', color:'var(--text)', fontSize:15, outline:'none' }} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'11px 14px', color:'var(--text)', fontSize:15, outline:'none' }} />
          </div>
          {error && <div style={{ background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:'var(--radius-sm)', padding:'10px 14px', color:'var(--red)', fontSize:14 }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:13, fontSize:15, fontWeight:600, marginTop:4 }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ marginTop:24, textAlign:'center', fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
          Regulated under the Children's Homes (England) Regulations 2015
        </p>
      </div>
    </div>
  )
}

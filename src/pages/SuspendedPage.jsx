export default function SuspendedPage({ profile, onLogout, expired }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:440, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:48, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:48 }}>{expired ? '⏱' : '🔒'}</div>
        <h1 style={{ fontSize:24, fontWeight:700 }}>{expired ? 'Trial Period Ended' : 'Account Suspended'}</h1>
        <p style={{ color:'var(--muted)', lineHeight:1.6 }}>
          {expired ? `Your free trial for ${profile.home_name} has expired.` : `Your account for ${profile.home_name} has been suspended.`} Please contact HBI Consultancy.
        </p>
        <a href="mailto:darren@hbiconsultancy.com" style={{ display:'block', background:'var(--accent)', color:'#fff', padding:'12px 28px', borderRadius:'var(--radius-sm)', textDecoration:'none', fontWeight:600, width:'100%', textAlign:'center' }}>Contact HBI Consultancy</a>
        <button onClick={onLogout} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--muted)', padding:'11px 28px', borderRadius:'var(--radius-sm)', width:'100%' }}>Sign out</button>
      </div>
    </div>
  )
}

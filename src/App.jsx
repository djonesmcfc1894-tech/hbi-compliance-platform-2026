import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import AdminPanel from './pages/AdminPanel'
import SuspendedPage from './pages/SuspendedPage'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span style={{ color:'var(--muted)', fontSize:14 }}>Loading...</span>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setProfile(null); setSession(null)
  }

  if (loading) return <Spinner />
  if (!session) return <LoginPage />
  if (!profile) return <Spinner />

  const isExpired = profile.trial_expires_at && new Date(profile.trial_expires_at) < new Date()
  if (profile.role !== 'admin' && (profile.is_suspended || isExpired)) {
    return <SuspendedPage profile={profile} onLogout={handleLogout} expired={isExpired} />
  }
  if (profile.role === 'admin') return <AdminPanel profile={profile} onLogout={handleLogout} />
  return <Dashboard profile={profile} onLogout={handleLogout} onRefresh={() => fetchProfile(profile.id)} />
}

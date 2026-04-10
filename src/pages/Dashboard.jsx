import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Scoring ───────────────────────────────────────────────────────
function getRating(pct) {
  if (pct >= 80) return { label: 'Outstanding', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (pct >= 50) return { label: 'Good', color: '#4f7cff', bg: 'rgba(79,124,255,0.12)' }
  if (pct >= 25) return { label: 'Requires Improvement', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
  return { label: 'Inadequate', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
}

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr)) / 86400000)
}

function isCompliantDate(dateStr, maxDays) {
  const d = daysSince(dateStr)
  return d !== null && d <= maxDays
}

function ragFromDate(dateStr, warningDays = 60, maxDays = null) {
  if (!dateStr) return 'not-set'
  if (maxDays !== null) {
    const age = daysSince(dateStr)
    if (age > maxDays) return 'overdue'
    if (age > maxDays - warningDays) return 'due-soon'
    return 'current'
  }
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= warningDays) return 'due-soon'
  return 'current'
}

function calcHomeScore(items) {
  if (!items.length) return 0
  const compliant = items.filter(item =>
    item.item_type === 'task' ? item.status === 'done' : isCompliantDate(item.last_completed, item.max_days || 365)
  ).length
  return Math.round((compliant / items.length) * 100)
}

function calcChildScore(child) {
  const checks = []
  checks.push({ name: 'Key worker assigned', pass: !!child.key_worker })
  checks.push({ name: 'Placement plan (monthly)', pass: isCompliantDate(child.placement_plan_date, 30) })
  checks.push({ name: 'Risk assessment (monthly)', pass: isCompliantDate(child.risk_assessment_date, 30) })
  checks.push({ name: 'LAC review (6 monthly)', pass: isCompliantDate(child.lac_date, 180) && !!child.lac_report_received })
  checks.push({ name: 'PEP (3 monthly)', pass: isCompliantDate(child.pep_date, 90) && !!child.pep_report_received })
  if (child.ehcp_applicable) {
    checks.push({ name: 'EHCP (annual)', pass: isCompliantDate(child.ehcp_date, 365) && !!child.ehcp_document_received })
  }
  if (child.placement_start) {
    const daysPlaced = daysSince(child.placement_start)
    if (daysPlaced > 73) checks.push({ name: 'GP registration', pass: !!child.gp_registration })
    else checks.push({ name: 'GP registration', pass: true })
  }
  checks.push({ name: 'Dentist registration', pass: !!child.dentist_registration })
  checks.push({ name: 'Optician registration', pass: !!child.optician_registration })
  checks.push({ name: 'Keywork sessions (8/month)', pass: (child.keywork_sessions_this_month || 0) >= 8 })
  checks.push({ name: 'Consent forms', pass: !!child.consent_forms })
  checks.push({ name: 'Delegation of authority', pass: !!child.delegation_of_authority })
  const passed = checks.filter(c => c.pass).length
  return { score: Math.round((passed / checks.length) * 100), checks }
}

function calcLiveScore(events) {
  if (!events.length) return 100
  let totalChecks = 0
  let passedChecks = 0
  events.forEach(ev => {
    const checks = [
      ev.reactive_keywork, ev.staff_debrief, ev.report_completed,
      ev.shared_social_worker, ev.risk_assessment_review, ev.placement_plan_updated
    ]
    if (ev.reg40_applicable) checks.push(ev.reg40_completed)
    if (ev.event_type === 'mfh' && ev.return_home_interview_applicable) checks.push(ev.return_home_interview)
    totalChecks += checks.length
    passedChecks += checks.filter(Boolean).length
  })
  return totalChecks === 0 ? 100 : Math.round((passedChecks / totalChecks) * 100)
}

// ─── Constants ─────────────────────────────────────────────────────
const TABS = ['Dashboard', 'Home', 'Children', 'Staff', 'Training', 'Reg 40', 'Live Compliance', 'Feedback']

const HOME_ITEMS_DEF = [
  { label: 'Ofsted Certificate (Printed)', type: 'task' },
  { label: 'Statement of Purpose', type: 'date', days: 365 },
  { label: 'Gas Safety Certificate', type: 'date', days: 365 },
  { label: 'PAT Testing', type: 'date', days: 365 },
  { label: 'Emergency Lighting Test', type: 'date', days: 182 },
  { label: 'Health & Safety Inspection', type: 'date', days: 365 },
  { label: 'Legionella Risk Assessment', type: 'date', days: 730 },
  { label: 'Fire Extinguisher Inspection', type: 'date', days: 365 },
  { label: 'Fire Detection Inspection', type: 'date', days: 365 },
  { label: 'Fire Risk Assessment', type: 'date', days: 365 },
  { label: 'Fire Alarm Inspection', type: 'date', days: 182 },
  { label: 'Electrical Installation Inspection', type: 'date', days: 1825 },
  { label: 'Insurance Certificates', type: 'date', days: 365 },
  { label: 'Building Risk Assessment', type: 'date', days: 365 },
  { label: 'Ofsted Registration Current', type: 'task' },
  { label: 'Regulation 45 Report', type: 'reg45', days: 182 },
  { label: 'Regulation 46 Location Risk Assessment', type: 'date', days: 365 },
]

const TRAINING_COLS = ['Safeguarding', 'First Aid', 'Fire Safety', 'Moving & Handling', 'Team Teach', 'Medication', 'Restraint/PBS']
const MONTHS_ALL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const RAG_STYLE = {
  'current':  { color: 'var(--green)', bg: 'var(--green-bg)', label: 'Current' },
  'due-soon': { color: 'var(--amber)', bg: 'var(--amber-bg)', label: 'Due Soon' },
  'overdue':  { color: 'var(--red)',   bg: 'var(--red-bg)',   label: 'Overdue' },
  'not-set':  { color: 'var(--muted)', bg: 'var(--surface2)', label: 'Not Set' },
  'done':     { color: 'var(--green)', bg: 'var(--green-bg)', label: 'Done' },
  'pending':  { color: 'var(--muted)', bg: 'var(--surface2)', label: 'Pending' },
}

// ─── Shared UI ─────────────────────────────────────────────────────
function Pill({ status }) {
  const st = RAG_STYLE[status] || RAG_STYLE['not-set']
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: st.color, background: st.bg, whiteSpace: 'nowrap' }}>{st.label}</span>
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 36, height: 20, borderRadius: 10, background: value ? 'var(--green)' : 'var(--border)', cursor: 'pointer', position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  )
}

function FI({ value, onChange, type = 'text', placeholder = '', style: sx = {} }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', ...sx }} />
  )
}

function SectionHead({ children: c }) {
  return <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', margin: '20px 0 10px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{c}</div>
}

function Row({ label, children: c }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
      <div>{c}</div>
    </div>
  )
}

// --- Score Card ---------------------------------------------------
function RevCounter({ label, pct, sub }) {
  const clamp = Math.min(100, Math.max(0, pct ?? 0))
  const rating = getRating(clamp)
  const gradientBg = clamp >= 80 ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : clamp >= 50 ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : clamp >= 25 ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : 'linear-gradient(135deg,#fef2f2,#fee2e2)'
  return (
    <div style={{ background: gradientBg, borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 52, fontWeight: 900, color: rating.color, lineHeight: 1, fontFamily: 'Syne,sans-serif' }}>{Math.round(clamp)}%</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: rating.color }}>{rating.label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{sub}</div>}
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.08)', marginTop: 4 }}>
        <div style={{ height: '100%', width: `${clamp}%`, borderRadius: 4, background: rating.color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
// ─── Main App ──────────────────────────────────────────────────────
export default function Dashboard({ profile, onLogout }) {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [homeItems, setHomeItems] = useState([])
  const [children, setChildren] = useState([])
  const [staff, setStaff] = useState([])
  const [training, setTraining] = useState([])
  const [liveEvents, setLiveEvents] = useState([])
  const [homeDetails, setHomeDetails] = useState({})
  const [loading, setLoading] = useState(true)
  const uid = profile.id

  const load = useCallback(async () => {
    setLoading(true)
    const [hi, ch, st, tr, le, hd] = await Promise.all([
      supabase.from('home_items').select('*').eq('user_id', uid).order('sort_order'),
      supabase.from('children').select('*').eq('user_id', uid).order('sort_order'),
      supabase.from('staff').select('*').eq('user_id', uid).order('name'),
      supabase.from('training').select('*').eq('user_id', uid),
      supabase.from('live_events').select('*').eq('user_id', uid).order('event_date', { ascending: false }),
      supabase.from('home_details').select('*').eq('user_id', uid).single(),
    ])
    let items = hi.data || []
    if (!items.length) {
      const seeds = HOME_ITEMS_DEF.map((item, i) => ({ user_id: uid, label: item.label, item_type: item.type, max_days: item.days || null, sort_order: i, status: 'pending' }))
      const { data: seeded } = await supabase.from('home_items').insert(seeds).select()
      items = seeded || []
    }
    setHomeItems(items); setChildren(ch.data || []); setStaff(st.data || [])
    setTraining(tr.data || []); setLiveEvents(le.data || []); setHomeDetails(hd.data || {})
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  const homeScore = calcHomeScore(homeItems)
  const childScores = children.map(c => calcChildScore(c))
  const avgChildScore = childScores.length ? Math.round(childScores.reduce((s, x) => s + x.score, 0) / childScores.length) : 100
  const liveScore = calcLiveScore(liveEvents)

  async function updateHomeItem(id, field, value) {
    await supabase.from('home_items').update({ [field]: value }).eq('id', id)
    setHomeItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  async function addChild() {
    const name = prompt('Child name or initials:')
    if (!name) return
    const { data, error } = await supabase.from('children').insert({ user_id: uid, name, sort_order: children.length }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) setChildren(prev => [...prev, data])
  }
  async function updateChild(id, field, value) {
    await supabase.from('children').update({ [field]: value ?? null }).eq('id', id)
    setChildren(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }
  async function deleteChild(id) {
    if (!confirm('Remove this child record?')) return
    await supabase.from('children').delete().eq('id', id)
    setChildren(prev => prev.filter(c => c.id !== id))
  }
  async function addStaff() {
    const name = prompt('Staff member name:')
    if (!name) return
    const { data, error } = await supabase.from('staff').insert({ user_id: uid, name }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) setStaff(prev => [...prev, data])
  }
  async function updateStaff(id, field, value) {
    await supabase.from('staff').update({ [field]: value ?? null }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }
  async function deleteStaff(id) {
    if (!confirm('Remove?')) return
    await supabase.from('staff').delete().eq('id', id)
    setStaff(prev => prev.filter(s => s.id !== id))
  }
  async function addTraining() {
    const name = prompt('Staff member name:')
    if (!name) return
    const { data, error } = await supabase.from('training').insert({ user_id: uid, staff_name: name }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) setTraining(prev => [...prev, data])
  }
  async function updateTraining(id, field, value) {
    await supabase.from('training').update({ [field]: value ?? null }).eq('id', id)
    setTraining(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }
  async function addLiveEvent(type) {
    const { data, error } = await supabase.from('live_events').insert({ user_id: uid, event_type: type, event_date: new Date().toISOString().slice(0, 10) }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) setLiveEvents(prev => [data, ...prev])
  }
  async function updateLiveEvent(id, field, value) {
    await supabase.from('live_events').update({ [field]: value }).eq('id', id)
    setLiveEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }
  async function deleteLiveEvent(id) {
    if (!confirm('Delete?')) return
    await supabase.from('live_events').delete().eq('id', id)
    setLiveEvents(prev => prev.filter(e => e.id !== id))
  }
  async function saveHomeDetails(d) {
    const { data: ex } = await supabase.from('home_details').select('id').eq('user_id', uid).single()
    if (ex) await supabase.from('home_details').update(d).eq('user_id', uid)
    else await supabase.from('home_details').insert({ ...d, user_id: uid })
    setHomeDetails(d)
  }

  const trialDays = profile.trial_expires_at ? Math.max(0, Math.ceil((new Date(profile.trial_expires_at) - new Date()) / 86400000)) : null

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, height: 56, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 12, color: '#fff' }}>CH</div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15 }}>{profile.home_name}</span>
        </div>
        {trialDays !== null && <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, color: trialDays <= 7 ? 'var(--red)' : 'var(--amber)', background: trialDays <= 7 ? 'var(--red-bg)' : 'var(--amber-bg)' }}>{trialDays}d trial remaining</div>}
        <div style={{ flex: 1 }} />
        <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 14px', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Sign out</button>
      </div>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === tab ? 'var(--accent)' : 'var(--muted)', padding: '14px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {tab}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
        {activeTab === 'Dashboard' && <DashView homeScore={homeScore} childScore={avgChildScore} liveScore={liveScore} children={children} childScores={childScores} />}
        {activeTab === 'Home' && <HomeView items={homeItems} details={homeDetails} onUpdate={updateHomeItem} onSaveDetails={saveHomeDetails} />}
        {activeTab === 'Children' && <ChildrenView children={children} onAdd={addChild} onUpdate={updateChild} onDelete={deleteChild} />}
        {activeTab === 'Staff' && <StaffView staff={staff} onAdd={addStaff} onUpdate={updateStaff} onDelete={deleteStaff} />}
        {activeTab === 'Training' && <TrainingView training={training} onAdd={addTraining} onUpdate={updateTraining} />}
        {activeTab === 'Reg 40' && <Reg40View userId={uid} />}
        {activeTab === 'Live Compliance' && <LiveView events={liveEvents} children={children} onAdd={addLiveEvent} onUpdate={updateLiveEvent} onDelete={deleteLiveEvent} />}
        {activeTab === 'Feedback' && <FeedbackView userId={uid} children={children} />}
      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────
function DashView({ homeScore, childScore, liveScore, children, childScores }) {
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>Good {greeting}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>{now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20, marginBottom: 28 }}>
        {[
          { label: 'Home Compliance', score: homeScore, sub: 'Health & safety, certifications, Ofsted' },
          { label: 'Children & Young People', score: childScore, sub: 'Placements, keywork, reviews, registrations' },
          { label: 'Live Compliance', score: liveScore, sub: 'Incidents, MFH, PI follow-up actions' },
        ].map(({ label, score, sub }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <RevCounter label={label} pct={score} sub={sub} />
          </div>
        ))}
      </div>
      {children.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Individual Child Scores</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {children.map((child, i) => {
              const { score, checks } = childScores[i] || { score: 0, checks: [] }
              const rating = getRating(score)
              const failed = checks.filter(c => !c.pass)
              return (
                <div key={child.id} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: failed.length ? 6 : 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{child.name}</span>
                    <div style={{ height: 8, width: 120, background: 'var(--border)', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${score}%`, background: rating.color, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: rating.color, width: 38, textAlign: 'right' }}>{score}%</span>
                    <span style={{ fontSize: 12, color: rating.color, background: rating.bg, padding: '2px 8px', borderRadius: 10 }}>{rating.label}</span>
                  </div>
                  {failed.length > 0 && <div style={{ fontSize: 12, color: 'var(--red)' }}>Needs: {failed.map(c => c.name).join(', ')}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Home ──────────────────────────────────────────────────────────
function HomeView({ items, details, onUpdate, onSaveDetails }) {
  const [ld, setLd] = useState(details)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setLd(details) }, [details])
  async function save() { await onSaveDetails(ld); setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const score = calcHomeScore(items)
  const rating = getRating(score)
  const th = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 14 }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 2 }}>🏠 Home Compliance</h1><p style={{ color: 'var(--muted)', fontSize: 13 }}>Health & safety, certifications and Ofsted registration</p></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 28, fontWeight: 800, color: rating.color }}>{score}%</div><div style={{ fontSize: 13, color: rating.color }}>{rating.label}</div></div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Home Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
          {[['Registered Manager','registered_manager'],['Responsible Individual','ri_name'],['Ofsted Number','ofsted_number'],['Max Occupancy','max_occupancy','number'],['Telephone','phone'],['Email','email']].map(([label, key, type='text']) => (
            <div key={key}><label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
              <input type={type} value={ld[key]||''} onChange={e => setLd(d=>({...d,[key]:e.target.value}))} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', color:'var(--text)', fontSize:14, outline:'none', width:'100%' }} />
            </div>
          ))}
          <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>Address</label>
            <textarea value={ld.address||''} onChange={e => setLd(d=>({...d,address:e.target.value}))} rows={2} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', color:'var(--text)', fontSize:14, outline:'none', width:'100%', resize:'vertical' }} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, marginTop:16 }}>
          {saved && <span style={{ color:'var(--green)', fontSize:13 }}>✓ Saved</span>}
          <button onClick={save} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Save Details</button>
        </div>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr><th style={{...th,textAlign:'left'}}>Item</th><th style={th}>Frequency</th><th style={th}>Last Completed</th><th style={th}>Status</th><th style={th}>Notes</th></tr></thead>
          <tbody>
            {items.map(item => {
              const rag = item.item_type==='task' ? (item.status==='done'?'done':'pending') : ragFromDate(item.last_completed, 60, item.max_days||365)
              return (
                <tr key={item.id}>
                  <td style={{...td,fontWeight:500}}>{item.label}</td>
                  <td style={{...td,textAlign:'center'}}>
                    {item.item_type==='date' ? <span style={{background:'var(--surface2)',border:'1px solid var(--accent)',color:'var(--accent)',borderRadius:4,padding:'2px 8px',fontSize:12}}>{item.max_days}d</span>
                      : <span style={{background:'var(--green-bg)',border:'1px solid var(--green)',color:'var(--green)',borderRadius:4,padding:'2px 8px',fontSize:12}}>Task</span>}
                  </td>
                  <td style={{...td,textAlign:'center'}}>
                    {item.item_type==='date' ? <input type="date" value={item.last_completed||''} onChange={e=>onUpdate(item.id,'last_completed',e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'5px 8px',color:'var(--text)',fontSize:13,outline:'none'}} />
                      : <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}><Toggle value={item.status==='done'} onChange={v=>onUpdate(item.id,'status',v?'done':'pending')} /><span style={{fontSize:12,color:'var(--muted)'}}>{item.status==='done'?'Done':'Pending'}</span></div>}
                  </td>
                  <td style={{...td,textAlign:'center'}}><Pill status={rag} /></td>
                  <td style={td}><input type="text" value={item.notes||''} onChange={e=>onUpdate(item.id,'notes',e.target.value)} placeholder="Notes..." style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'5px 10px',color:'var(--text)',fontSize:13,outline:'none',width:'100%'}} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Children ──────────────────────────────────────────────────────
function ChildrenView({ children, onAdd, onUpdate, onDelete }) {
  const [sel, setSel] = useState(0)
  const child = children[sel]
  const { score, checks } = child ? calcChildScore(child) : { score: 0, checks: [] }
  const rating = getRating(score)

  if (!children.length) return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>👦 Children</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Child</button>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:48, textAlign:'center', color:'var(--muted)' }}>No children added yet.</div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>👦 Children</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Child</button>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {children.map((c, i) => (
          <button key={c.id} onClick={() => setSel(i)} style={{ background:sel===i?'var(--accent)':'transparent', color:sel===i?'#fff':'var(--text)', border:sel===i?'none':'1px solid var(--border)', borderRadius:20, padding:'7px 18px', fontSize:14, fontWeight:500, cursor:'pointer' }}>{c.name}</button>
        ))}
      </div>
      {child && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:4 }}>
            <input value={child.name} onChange={e => onUpdate(child.id,'name',e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px', color:'var(--text)', fontSize:16, fontWeight:600, outline:'none', maxWidth:260 }} />
            <div style={{ flex:1 }} />
            <span style={{ fontSize:20, fontWeight:800, color:rating.color }}>{score}%</span>
            <span style={{ fontSize:13, color:rating.color, background:rating.bg, padding:'3px 10px', borderRadius:10 }}>{rating.label}</span>
            <button onClick={() => onDelete(child.id)} style={{ background:'transparent', border:'1px solid var(--red)', color:'var(--red)', borderRadius:'var(--radius-sm)', padding:'6px 14px', fontSize:13, cursor:'pointer' }}>Remove</button>
          </div>
          {checks.filter(c=>!c.pass).length > 0 && <div style={{ fontSize:12, color:'var(--red)', marginBottom:12 }}>Needs: {checks.filter(c=>!c.pass).map(c=>c.name).join(', ')}</div>}

          <SectionHead>Placement Details</SectionHead>
          <Row label="Date of Birth"><FI type="date" value={child.date_of_birth} onChange={v=>onUpdate(child.id,'date_of_birth',v)} /></Row>
          <Row label="Placement Start"><FI type="date" value={child.placement_start} onChange={v=>onUpdate(child.id,'placement_start',v)} /></Row>
          <Row label="Placing Authority"><FI value={child.placing_authority} onChange={v=>onUpdate(child.id,'placing_authority',v)} placeholder="e.g. Manchester City Council" /></Row>
          <Row label="Key Worker"><FI value={child.key_worker} onChange={v=>onUpdate(child.id,'key_worker',v)} placeholder="Staff name" /></Row>

          <SectionHead>Placement Plan & Risk (Monthly)</SectionHead>
          <Row label="Placement Plan Updated">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <FI type="date" value={child.placement_plan_date} onChange={v=>onUpdate(child.id,'placement_plan_date',v)} sx={{ maxWidth:160 }} />
              <Pill status={isCompliantDate(child.placement_plan_date,30)?'current':'overdue'} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Monthly</span>
            </div>
          </Row>
          <Row label="Risk Assessment Reviewed">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <FI type="date" value={child.risk_assessment_date} onChange={v=>onUpdate(child.id,'risk_assessment_date',v)} sx={{ maxWidth:160 }} />
              <Pill status={isCompliantDate(child.risk_assessment_date,30)?'current':'overdue'} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Monthly</span>
            </div>
          </Row>
          <Row label="Keywork Sessions This Month">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <input type="number" min="0" max="31" value={child.keywork_sessions_this_month||0} onChange={e=>onUpdate(child.id,'keywork_sessions_this_month',parseInt(e.target.value)||0)}
                style={{ width:70, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'7px 10px', color:'var(--text)', fontSize:14, outline:'none', textAlign:'center' }} />
              <span style={{ fontSize:13, fontWeight:600, color:(child.keywork_sessions_this_month||0)>=8?'var(--green)':'var(--red)' }}>
                {(child.keywork_sessions_this_month||0)>=8?'✓ Target met (8/month)':`✗ Need ${8-(child.keywork_sessions_this_month||0)} more`}
              </span>
            </div>
          </Row>

          <SectionHead>Reviews & Reports</SectionHead>
          <Row label="LAC Review Date">
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <FI type="date" value={child.lac_date} onChange={v=>onUpdate(child.id,'lac_date',v)} sx={{ maxWidth:160 }} />
              <Pill status={isCompliantDate(child.lac_date,180)?'current':'overdue'} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>6 monthly</span>
            </div>
          </Row>
          <Row label="LAC Report Received">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Toggle value={child.lac_report_received} onChange={v=>onUpdate(child.id,'lac_report_received',v)} />
              <span style={{ fontSize:13, color:child.lac_report_received?'var(--green)':'var(--muted)' }}>{child.lac_report_received?'Received':'Not received'}</span>
            </div>
          </Row>
          <Row label="PEP Date">
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <FI type="date" value={child.pep_date} onChange={v=>onUpdate(child.id,'pep_date',v)} sx={{ maxWidth:160 }} />
              <Pill status={isCompliantDate(child.pep_date,90)?'current':'overdue'} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>3 monthly</span>
            </div>
          </Row>
          <Row label="PEP Report Received">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Toggle value={child.pep_report_received} onChange={v=>onUpdate(child.id,'pep_report_received',v)} />
              <span style={{ fontSize:13, color:child.pep_report_received?'var(--green)':'var(--muted)' }}>{child.pep_report_received?'Received':'Not received'}</span>
            </div>
          </Row>
          <Row label="EHCP Applicable">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Toggle value={child.ehcp_applicable} onChange={v=>onUpdate(child.id,'ehcp_applicable',v)} />
              <span style={{ fontSize:13, color:'var(--muted)' }}>{child.ehcp_applicable?'Yes — tracking EHCP':'Not applicable'}</span>
            </div>
          </Row>
          {child.ehcp_applicable && <>
            <Row label="EHCP Review Date">
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <FI type="date" value={child.ehcp_date} onChange={v=>onUpdate(child.id,'ehcp_date',v)} sx={{ maxWidth:160 }} />
                <Pill status={isCompliantDate(child.ehcp_date,365)?'current':'overdue'} />
                <span style={{ fontSize:12, color:'var(--muted)' }}>Annual</span>
              </div>
            </Row>
            <Row label="EHCP Document Received">
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Toggle value={child.ehcp_document_received} onChange={v=>onUpdate(child.id,'ehcp_document_received',v)} />
                <span style={{ fontSize:13, color:child.ehcp_document_received?'var(--green)':'var(--muted)' }}>{child.ehcp_document_received?'Received':'Not received'}</span>
              </div>
            </Row>
          </>}
          <Row label="Care Plan Date"><FI type="date" value={child.care_plan_date} onChange={v=>onUpdate(child.id,'care_plan_date',v)} /></Row>

          <SectionHead>Medical & Health</SectionHead>
          <Row label="GP Registration">
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <FI type="date" value={child.gp_registration} onChange={v=>onUpdate(child.id,'gp_registration',v)} sx={{ maxWidth:160 }} />
              {child.placement_start && <span style={{ fontSize:12, color:'var(--muted)' }}>Within 73 days of placement</span>}
            </div>
          </Row>
          <Row label="Dentist Registration"><FI type="date" value={child.dentist_registration} onChange={v=>onUpdate(child.id,'dentist_registration',v)} /></Row>
          <Row label="Optician Registration"><FI type="date" value={child.optician_registration} onChange={v=>onUpdate(child.id,'optician_registration',v)} /></Row>
          <Row label="Medical Consent"><div style={{ display:'flex', alignItems:'center', gap:10 }}><Toggle value={child.medical_consent} onChange={v=>onUpdate(child.id,'medical_consent',v)} /><span style={{ fontSize:13, color:'var(--muted)' }}>{child.medical_consent?'Signed':'Not signed'}</span></div></Row>
          <Row label="NHS Number"><FI value={child.nhs_number} onChange={v=>onUpdate(child.id,'nhs_number',v)} placeholder="NHS number" /></Row>
          <Row label="Medical Notes"><FI value={child.medical_notes} onChange={v=>onUpdate(child.id,'medical_notes',v)} placeholder="Any medical notes..." /></Row>

          <SectionHead>Documents on File</SectionHead>
          {[['Consent Forms on File','consent_forms'],['Delegation of Authority','delegation_of_authority'],['Initial Placement Plan','initial_placement_plan']].map(([label,key]) => (
            <Row key={key} label={label}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Toggle value={child[key]} onChange={v=>onUpdate(child.id,key,v)} />
                <span style={{ fontSize:13, color:child[key]?'var(--green)':'var(--muted)' }}>{child[key]?'On file':'Not yet received'}</span>
              </div>
            </Row>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Staff ─────────────────────────────────────────────────────────
function StaffView({ staff, onAdd, onUpdate, onDelete }) {
  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:13 }
  function supStatus(m) {
    const dates = MONTHS_ALL.map(mo => m[`supervision_${mo.toLowerCase()}`]).filter(Boolean)
    if (!dates.length) return 'not-set'
    const d = daysSince(dates.sort().reverse()[0])
    return d <= 42 ? 'current' : d <= 56 ? 'due-soon' : 'overdue'
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div><h1 style={{ fontSize:26, fontWeight:700 }}>👥 Staff</h1><p style={{ color:'var(--muted)', fontSize:13 }}>Supervisions must occur within every 6-week cycle</p></div>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Staff</button>
      </div>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:10 }}>Staff Register</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto', marginBottom:24 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead><tr>{['Name','Role','Start Date','DBS No.','DBS Expiry','Photo ID 1','Photo ID 2','Proof of Addr','Driving Lic','Performance','Supervision',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {!staff.length ? <tr><td colSpan={12} style={{...td,textAlign:'center',color:'var(--muted)',padding:32}}>No staff added yet</td></tr>
            : staff.map(m=>(
              <tr key={m.id}>
                <td style={td}><FI value={m.name} onChange={v=>onUpdate(m.id,'name',v)} /></td>
                <td style={td}><FI value={m.role} onChange={v=>onUpdate(m.id,'role',v)} placeholder="e.g. RSW" /></td>
                <td style={td}><FI type="date" value={m.start_date} onChange={v=>onUpdate(m.id,'start_date',v)} /></td>
                <td style={td}><FI value={m.dbs_number} onChange={v=>onUpdate(m.id,'dbs_number',v)} placeholder="DBS no." /></td>
                <td style={td}><div style={{ display:'flex', flexDirection:'column', gap:4 }}><FI type="date" value={m.dbs_expiry} onChange={v=>onUpdate(m.id,'dbs_expiry',v)} />{m.dbs_expiry&&<Pill status={ragFromDate(m.dbs_expiry,90)} />}</div></td>
                {['photo_id_1','photo_id_2','proof_of_address','driving_licence'].map(k=><td key={k} style={{...td,textAlign:'center'}}><Toggle value={m[k]} onChange={v=>onUpdate(m.id,k,v)} /></td>)}
                <td style={td}><select value={m.performance_rating||'Satisfactory'} onChange={e=>onUpdate(m.id,'performance_rating',e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--text)', fontSize:12, outline:'none', cursor:'pointer' }}>{['Outstanding','Good','Satisfactory','Requires Improvement','Unsatisfactory'].map(o=><option key={o}>{o}</option>)}</select></td>
                <td style={{...td,textAlign:'center'}}><Pill status={supStatus(m)} /></td>
                <td style={td}><button onClick={()=>onDelete(m.id)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:10 }}>Supervisions</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead><tr><th style={{...th,textAlign:'left'}}>Staff Name</th><th style={th}>Type</th>{MONTHS_ALL.map(m=><th key={m} style={th}>{m}</th>)}</tr></thead>
          <tbody>
            {!staff.length ? <tr><td colSpan={14} style={{...td,textAlign:'center',color:'var(--muted)',padding:24}}>No staff added yet</td></tr>
            : staff.map(m=>(
              <tr key={m.id}>
                <td style={{...td,fontWeight:500}}>{m.name}</td>
                <td style={td}><select value={m.supervision_type||'Monthly'} onChange={e=>onUpdate(m.id,'supervision_type',e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:12, outline:'none' }}><option>Monthly</option><option>6 Weekly</option><option>Quarterly</option></select></td>
                {MONTHS_ALL.map(mo=><td key={mo} style={{...td,textAlign:'center'}}><input type="date" value={m[`supervision_${mo.toLowerCase()}`]||''} onChange={e=>onUpdate(m.id,`supervision_${mo.toLowerCase()}`,e.target.value)} style={{ width:120, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:11, outline:'none' }} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Training ──────────────────────────────────────────────────────
function TrainingView({ training, onAdd, onUpdate }) {
  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', textAlign:'center', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', textAlign:'center' }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>📚 Training</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Staff</button>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
          <thead><tr><th style={{...th,textAlign:'left'}}>Staff Name</th>{TRAINING_COLS.map(c=><th key={c} style={th}>{c}</th>)}</tr></thead>
          <tbody>
            {!training.length ? <tr><td colSpan={TRAINING_COLS.length+1} style={{...td,color:'var(--muted)',padding:28}}>No training records yet</td></tr>
            : training.map(row=>(
              <tr key={row.id}>
                <td style={{...td,textAlign:'left',fontWeight:500,padding:'8px 14px'}}>{row.staff_name}</td>
                {TRAINING_COLS.map(col=>{
                  const key = col.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_').replace(/^_|_$/g,'')
                  return (
                    <td key={col} style={td}>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
                        <input type="date" value={row[key]||''} onChange={e=>onUpdate(row.id,key,e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:12, outline:'none', width:120 }} />
                        {row[key]&&<Pill status={ragFromDate(row[key],90)} />}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Reg 40 ────────────────────────────────────────────────────────
function Reg40View({ userId }) {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { supabase.from('reg40_visits').select('*').eq('user_id',userId).order('visit_date',{ascending:false}).then(({data})=>{setVisits(data||[]);setLoading(false)}) },[userId])
  async function addVisit() {
    const {data} = await supabase.from('reg40_visits').insert({user_id:userId,visit_date:new Date().toISOString().slice(0,10)}).select().single()
    if(data) setVisits(p=>[data,...p])
  }
  async function update(id,field,value) {
    await supabase.from('reg40_visits').update({[field]:value}).eq('id',id)
    setVisits(p=>p.map(v=>v.id===id?{...v,[field]:value}:v))
  }
  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:13 }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>📋 Regulation 40</h1>
        <button onClick={addVisit} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Log Visit</button>
      </div>
      {loading?<p style={{color:'var(--muted)'}}>Loading...</p>:(
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
            <thead><tr>{['Visit Date','Type','Completed By','Rating','Outcomes','Report'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {!visits.length?<tr><td colSpan={6} style={{...td,textAlign:'center',color:'var(--muted)',padding:32}}>No visits logged yet</td></tr>
              :visits.map(v=>(
                <tr key={v.id}>
                  <td style={td}><FI type="date" value={v.visit_date} onChange={val=>update(v.id,'visit_date',val)} /></td>
                  <td style={td}><select value={v.visit_type||'Announced'} onChange={e=>update(v.id,'visit_type',e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'6px 8px',color:'var(--text)',fontSize:13,outline:'none'}}><option>Announced</option><option>Unannounced</option></select></td>
                  <td style={td}><FI value={v.completed_by} onChange={val=>update(v.id,'completed_by',val)} placeholder="RI name" /></td>
                  <td style={td}><select value={v.rating||''} onChange={e=>update(v.id,'rating',e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'6px 8px',color:'var(--text)',fontSize:13,outline:'none'}}><option value="">Select...</option>{['Outstanding','Good','Requires Improvement','Inadequate'].map(o=><option key={o}>{o}</option>)}</select></td>
                  <td style={td}><FI value={v.outcomes} onChange={val=>update(v.id,'outcomes',val)} placeholder="Key actions..." /></td>
                  <td style={{...td,textAlign:'center'}}><Toggle value={v.report_submitted} onChange={val=>update(v.id,'report_submitted',val)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Live Compliance ───────────────────────────────────────────────
function LiveView({ events, children, onAdd, onUpdate, onDelete }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? events : events.filter(e => e.event_type === filter)
  const score = calcLiveScore(events)
  const rating = getRating(score)
  const TYPE_LABEL = { incident:'Incident', mfh:'MFH', pi:'PI' }
  const TYPE_COLOR = { incident:'var(--red)', mfh:'var(--amber)', pi:'#a855f7' }

  function isComplete(ev) {
    const base = ev.reactive_keywork&&ev.staff_debrief&&ev.report_completed&&ev.shared_social_worker&&ev.risk_assessment_review&&ev.placement_plan_updated
    const reg40 = !ev.reg40_applicable||ev.reg40_completed
    const rhi = ev.event_type!=='mfh'||!ev.return_home_interview_applicable||ev.return_home_interview
    return base&&reg40&&rhi
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div><h1 style={{ fontSize:26, fontWeight:700, marginBottom:2 }}>⚡ Live Compliance</h1><p style={{ color:'var(--muted)', fontSize:13 }}>All follow-up actions must be completed for each event</p></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:24, fontWeight:800, color:rating.color }}>{score}%</div><div style={{ fontSize:13, color:rating.color }}>{rating.label}</div></div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        {['all','incident','mfh','pi'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{ background:filter===f?'var(--accent)':'transparent', color:filter===f?'#fff':'var(--muted)', border:filter===f?'none':'1px solid var(--border)', borderRadius:20, padding:'6px 16px', fontSize:13, cursor:'pointer' }}>
            {f==='all'?'All':TYPE_LABEL[f]}
          </button>
        ))}
        <div style={{ flex:1 }} />
        {['incident','mfh','pi'].map(type=>(
          <button key={type} onClick={()=>onAdd(type)} style={{ background:'var(--surface)', border:`1px solid ${TYPE_COLOR[type]}`, color:TYPE_COLOR[type], borderRadius:'var(--radius-sm)', padding:'7px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>+ {TYPE_LABEL[type]}</button>
        ))}
      </div>
      {!filtered.length ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:48, textAlign:'center', color:'var(--muted)' }}>No events logged. Use the buttons above to log an incident, MFH or PI.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map(ev=>{
            const complete = isComplete(ev)
            const color = TYPE_COLOR[ev.event_type]
            const CHECKS = [
              {key:'reactive_keywork',label:'Reactive Key Work'},
              {key:'staff_debrief',label:'Staff Debrief'},
              {key:'report_completed',label:'Report Completed'},
              {key:'shared_social_worker',label:'Shared with Social Worker'},
              {key:'risk_assessment_review',label:'Risk Assessment Reviewed'},
              {key:'placement_plan_updated',label:'Placement Plan Updated'},
            ]
            return (
              <div key={ev.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderLeft:`4px solid ${complete?'var(--green)':color}`, borderRadius:'var(--radius)', padding:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
                  <span style={{ background:color, color:'#fff', borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:700 }}>{TYPE_LABEL[ev.event_type]}</span>
                  <input type="date" value={ev.event_date||''} onChange={e=>onUpdate(ev.id,'event_date',e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--text)', fontSize:13, outline:'none' }} />
                  <select value={ev.child_name||''} onChange={e=>onUpdate(ev.id,'child_name',e.target.value)} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--text)', fontSize:13, outline:'none', flex:1 }}>
                    <option value="">Select child...</option>
                    {children.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <span style={{ fontSize:13, fontWeight:600, color:complete?'var(--green)':color }}>{complete?'✓ Complete':'✗ Actions outstanding'}</span>
                  <button onClick={()=>onDelete(ev.id)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8 }}>
                  {CHECKS.map(({key,label})=>(
                    <div key={key} onClick={()=>onUpdate(ev.id,key,!ev[key])} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface2)', borderRadius:'var(--radius-sm)', padding:'10px 12px', cursor:'pointer' }}>
                      <div style={{ width:20, height:20, borderRadius:5, border:`2px solid ${ev[key]?'var(--green)':'var(--border)'}`, background:ev[key]?'var(--green-bg)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {ev[key]&&<span style={{ color:'var(--green)', fontSize:13, fontWeight:700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:13, color:ev[key]?'var(--text)':'var(--muted)' }}>{label}</span>
                    </div>
                  ))}
                  <div style={{ background:'var(--surface2)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>Regulation 40</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}><Toggle value={ev.reg40_applicable} onChange={v=>onUpdate(ev.id,'reg40_applicable',v)} /><span style={{ fontSize:12, color:'var(--muted)' }}>Applicable</span></div>
                    {ev.reg40_applicable&&<div style={{ display:'flex', alignItems:'center', gap:8 }}><Toggle value={ev.reg40_completed} onChange={v=>onUpdate(ev.id,'reg40_completed',v)} /><span style={{ fontSize:12, color:ev.reg40_completed?'var(--green)':'var(--muted)' }}>Completed</span></div>}
                  </div>
                  {ev.event_type==='mfh'&&(
                    <div style={{ background:'var(--surface2)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
                      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>Return Home Interview</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}><Toggle value={ev.return_home_interview_applicable} onChange={v=>onUpdate(ev.id,'return_home_interview_applicable',v)} /><span style={{ fontSize:12, color:'var(--muted)' }}>Applicable</span></div>
                      {ev.return_home_interview_applicable&&<div style={{ display:'flex', alignItems:'center', gap:8 }}><Toggle value={ev.return_home_interview} onChange={v=>onUpdate(ev.id,'return_home_interview',v)} /><span style={{ fontSize:12, color:ev.return_home_interview?'var(--green)':'var(--muted)' }}>Completed</span></div>}
                    </div>
                  )}
                </div>
                <div style={{ marginTop:10 }}>
                  <input type="text" value={ev.notes||''} onChange={e=>onUpdate(ev.id,'notes',e.target.value)} placeholder="Additional notes..." style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', color:'var(--text)', fontSize:13, outline:'none', width:'100%' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Feedback ──────────────────────────────────────────────────────
function FeedbackView({ userId, children }) {
  const [yp, setYp] = useState({})
  const [st, setSt] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(()=>{
    async function load() {
      const [ypR,stR] = await Promise.all([supabase.from('yp_feedback').select('*').eq('user_id',userId),supabase.from('stakeholder_feedback').select('*').eq('user_id',userId)])
      const map={}
      for(const r of (ypR.data||[])){if(!map[r.child_name])map[r.child_name]={};map[r.child_name][r.month]=r}
      setYp(map);setSt(stR.data||[]);setLoading(false)
    }
    load()
  },[userId])
  async function updateYp(name,month,value) {
    const ex=yp[name]?.[month]
    if(ex){await supabase.from('yp_feedback').update({completed:value}).eq('id',ex.id)}
    else{const{data}=await supabase.from('yp_feedback').insert({user_id:userId,child_name:name,month,completed:value}).select().single();if(data){setYp(p=>({...p,[name]:{...(p[name]||{}),[month]:data}}));return}}
    setYp(p=>({...p,[name]:{...(p[name]||{}),[month]:{...(p[name]?.[month]||{}),completed:value}}}))
  }
  async function updateSt(id,field,value) {
    await supabase.from('stakeholder_feedback').update({[field]:value}).eq('id',id)
    setSt(p=>p.map(s=>s.id===id?{...s,[field]:value}:s))
  }
  const th={padding:'10px 12px',fontSize:11,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)',textAlign:'center',whiteSpace:'nowrap'}
  const td={padding:'8px 10px',borderBottom:'1px solid var(--border)',textAlign:'center'}
  const names=children.length?children.map(c=>c.name):['Child 1','Child 2','Child 3']
  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, marginBottom:24 }}>💬 Feedback</h1>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:10 }}>Young Person Feedback</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto', marginBottom:24 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead><tr><th style={{...th,textAlign:'left'}}>Young Person</th>{MONTHS_ALL.map(m=><th key={m} style={th}>{m}</th>)}</tr></thead>
          <tbody>{names.map(name=>(
            <tr key={name}>
              <td style={{...td,textAlign:'left',fontWeight:500,padding:'8px 14px'}}>{name}</td>
              {MONTHS_ALL.map(m=><td key={m} style={td}><Toggle value={yp[name]?.[m]?.completed} onChange={v=>updateYp(name,m,v)} /></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:10 }}>Stakeholder Feedback</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
          <thead><tr>{['Stakeholder','Date','Feedback Summary','Action Taken','Logged By'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{['Social Worker','Education','Police','Other'].map(type=>{
            const row=st.find(s=>s.stakeholder_type===type)||{}
            return(
              <tr key={type}>
                <td style={{...td,fontWeight:500,textAlign:'left',padding:'8px 14px'}}>{type}</td>
                <td style={td}><FI type="date" value={row.feedback_date} onChange={v=>row.id?updateSt(row.id,'feedback_date',v):null} /></td>
                <td style={td}><FI value={row.summary} onChange={v=>row.id?updateSt(row.id,'summary',v):null} placeholder="Summary..." /></td>
                <td style={td}><FI value={row.action_taken} onChange={v=>row.id?updateSt(row.id,'action_taken',v):null} placeholder="Action..." /></td>
                <td style={td}><FI value={row.logged_by} onChange={v=>row.id?updateSt(row.id,'logged_by',v):null} placeholder="Name..." /></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </div>
  )
}

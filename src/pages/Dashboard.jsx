import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────
const TABS = ['Dashboard','Home','Children','Staff','Training','Reg 40','Feedback']

const HOME_ITEMS = [
  { label:'Ofsted Certificate (Printed)', type:'task' },
  { label:'Statement of Purpose', type:'task' },
  { label:'Gas Safety Testing', type:'date', freq:'Annual' },
  { label:'PAT Testing', type:'date', freq:'Annual' },
  { label:'Emergency Lighting Testing', type:'date', freq:'Annual' },
  { label:'Health & Safety Inspection', type:'date', freq:'Annual' },
  { label:'Legionella Risk Assessment', type:'date', freq:'Annual' },
  { label:'Fire Extinguisher Inspection', type:'date', freq:'Annual' },
  { label:'Fire Detection Inspection', type:'date', freq:'Annual' },
  { label:'Fire Risk Assessment', type:'date', freq:'Annual' },
  { label:'Fire Alarm Inspection', type:'date', freq:'6 Monthly' },
  { label:'Electrical Installation Inspection', type:'date', freq:'5 Yearly' },
  { label:'Insurance Certificates', type:'date', freq:'Annual' },
  { label:'Building Risk Assessment', type:'date', freq:'Annual' },
]

const TRAINING_COLS = ['Safeguarding','First Aid','Fire Safety','Moving & Handling','Team Teach','Medication','Restraint/PBS']

const MONTHS_ALL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getCurrentOfstedYear() {
  const now = new Date()
  const start = now >= new Date(now.getFullYear(), 3, 1)
    ? new Date(now.getFullYear(), 3, 1)
    : new Date(now.getFullYear() - 1, 3, 1)
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(start)
    d.setMonth(d.getMonth() + i)
    months.push(d)
  }
  return months
}

const OFSTED_MONTHS = getCurrentOfstedYear()

function ragFromDate(dateStr, warningDays = 60) {
  if (!dateStr) return 'not-set'
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= warningDays) return 'due-soon'
  return 'current'
}

const RAG_STYLE = {
  'current':   { color:'var(--green)', bg:'var(--green-bg)', label:'Current' },
  'due-soon':  { color:'var(--amber)', bg:'var(--amber-bg)', label:'Due Soon' },
  'overdue':   { color:'var(--red)',   bg:'var(--red-bg)',   label:'Overdue' },
  'not-set':   { color:'var(--muted)', bg:'var(--surface2)', label:'Not Set' },
  'done':      { color:'var(--green)', bg:'var(--green-bg)', label:'Done' },
  'pending':   { color:'var(--muted)', bg:'var(--surface2)', label:'Pending' },
}

function Pill({ status }) {
  const st = RAG_STYLE[status] || RAG_STYLE['not-set']
  return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, color:st.color, background:st.bg, whiteSpace:'nowrap' }}>{st.label}</span>
}

function Input({ value, onChange, type='text', placeholder='', style={} }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'7px 10px', color:'var(--text)', fontSize:13, outline:'none', width:'100%', ...style }} />
  )
}

function StatusSelect({ value, onChange }) {
  return (
    <select value={value || 'pending'} onChange={e => onChange(e.target.value)}
      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 10px', color:'var(--text)', fontSize:13, outline:'none', cursor:'pointer' }}>
      <option value="pending">Pending</option>
      <option value="in-progress">In Progress</option>
      <option value="complete">Complete</option>
      <option value="action-required">Action Required</option>
    </select>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────
export default function Dashboard({ profile, onLogout }) {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [homeItems, setHomeItems] = useState([])
  const [children, setChildren] = useState([])
  const [staff, setStaff] = useState([])
  const [training, setTraining] = useState([])
  const [reg40, setReg40] = useState({})
  const [feedback, setFeedback] = useState({})
  const [homeDetails, setHomeDetails] = useState({})
  const [loading, setLoading] = useState(true)

  const uid = profile.id

  const load = useCallback(async () => {
    setLoading(true)
    const [hi, ch, st, tr, hd] = await Promise.all([
      supabase.from('home_items').select('*').eq('user_id', uid),
      supabase.from('children').select('*').eq('user_id', uid).order('sort_order'),
      supabase.from('staff').select('*').eq('user_id', uid).order('name'),
      supabase.from('training').select('*').eq('user_id', uid),
      supabase.from('home_details').select('*').eq('user_id', uid).single(),
    ])

    // Seed home items if none exist
    if (!hi.data || hi.data.length === 0) {
      const seeds = HOME_ITEMS.map((item, i) => ({ user_id: uid, label: item.label, item_type: item.type, freq: item.freq || null, sort_order: i }))
      const { data: seeded } = await supabase.from('home_items').insert(seeds).select()
      setHomeItems(seeded || [])
    } else {
      setHomeItems(hi.data || [])
    }

    setChildren(ch.data || [])
    setStaff(st.data || [])
    setTraining(tr.data || [])
    setHomeDetails(hd.data || {})
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  // ── Home items ──
  async function updateHomeItem(id, field, value) {
    await supabase.from('home_items').update({ [field]: value }).eq('id', id)
    setHomeItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // ── Children ──
  async function addChild() {
    const name = prompt('Child name or initials:')
    if (!name) return
    const { data } = await supabase.from('children').insert({ user_id: uid, name, sort_order: children.length }).select().single()
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

  // ── Staff ──
  async function addStaff() {
    const name = prompt('Staff member name:')
    if (!name) return
    const { data, error } = await supabase.from('staff').insert({ user_id: uid, name }).select().single()
    if (error) { alert('Error adding staff: ' + error.message); return }
    if (data) setStaff(prev => [...prev, data])
  }

  async function updateStaff(id, field, value) {
    await supabase.from('staff').update({ [field]: value ?? null }).eq('id', id)
    setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  async function deleteStaff(id) {
    if (!confirm('Remove staff member?')) return
    await supabase.from('staff').delete().eq('id', id)
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  // ── Training ──
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

  // ── Home details ──
  async function saveHomeDetails(details) {
    const { data: existing } = await supabase.from('home_details').select('id').eq('user_id', uid).single()
    if (existing) await supabase.from('home_details').update(details).eq('user_id', uid)
    else await supabase.from('home_details').insert({ ...details, user_id: uid })
    setHomeDetails(details)
  }

  const trialDays = profile.trial_expires_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_expires_at) - new Date()) / 86400000))
    : null

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 24px', display:'flex', alignItems:'center', gap:16, height:56, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginRight:8 }}>
          <div style={{ width:32, height:32, background:'var(--accent)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:12, color:'#fff' }}>CH</div>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15 }}>{profile.home_name}</span>
        </div>
        {trialDays !== null && (
          <div style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:500, color: trialDays <= 7 ? 'var(--red)' : 'var(--amber)', background: trialDays <= 7 ? 'var(--red-bg)' : 'var(--amber-bg)' }}>
            {trialDays}d trial remaining
          </div>
        )}
        <div style={{ flex:1 }} />
        <button onClick={onLogout} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 14px', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>Sign out</button>
      </div>

      {/* Tab bar */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 24px', display:'flex', gap:4, overflowX:'auto', flexShrink:0 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ background:'none', border:'none', borderBottom: activeTab===tab ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab===tab ? 'var(--accent)' : 'var(--muted)', padding:'14px 16px', fontSize:14, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:28, overflowY:'auto' }}>
        {activeTab === 'Dashboard' && <DashboardView homeItems={homeItems} staff={staff} training={training} children={children} />}
        {activeTab === 'Home' && <HomeView items={homeItems} details={homeDetails} onUpdate={updateHomeItem} onSaveDetails={saveHomeDetails} />}
        {activeTab === 'Children' && <ChildrenView children={children} onAdd={addChild} onUpdate={updateChild} onDelete={deleteChild} />}
        {activeTab === 'Staff' && <StaffView staff={staff} onAdd={addStaff} onUpdate={updateStaff} onDelete={deleteStaff} />}
        {activeTab === 'Training' && <TrainingView training={training} onAdd={addTraining} onUpdate={updateTraining} />}
        {activeTab === 'Reg 40' && <Reg40View userId={uid} />}
        {activeTab === 'Feedback' && <FeedbackView userId={uid} children={children} />}
      </div>
    </div>
  )
}

// ─── Dashboard Overview ────────────────────────────────────────────
function DashboardView({ homeItems, staff, training, children }) {
  const now = new Date()
  const homeCurrent = homeItems.filter(i => i.item_type === 'date' ? ragFromDate(i.last_completed) === 'current' : i.status === 'done').length
  const homeTotal = homeItems.length
  const homeScore = homeTotal ? Math.round(homeCurrent/homeTotal*100) : 0

  const h = now.getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'

  const sections = [
    { label:'Home', score: homeScore, icon:'🏠', color:'var(--accent)' },
    { label:'Children', score: 0, icon:'👦', color:'var(--green)' },
    { label:'Staff', score: 0, icon:'👥', color:'#a855f7' },
    { label:'Training', score: 0, icon:'📚', color:'var(--amber)' },
    { label:'Reg 40', score: 0, icon:'📋', color:'var(--red)' },
    { label:'Feedback', score: 0, icon:'💬', color:'#06b6d4' },
  ]

  const overall = Math.round(sections.reduce((s,x) => s+x.score, 0) / sections.length)
  const circumference = 2 * Math.PI * 54
  const ringColor = overall >= 80 ? 'var(--green)' : overall >= 50 ? 'var(--amber)' : 'var(--red)'

  return (
    <div>
      <h1 style={{ fontSize:32, fontWeight:800, marginBottom:4 }}>Good {greeting}</h1>
      <p style={{ color:'var(--muted)', marginBottom:28 }}>{now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:28, marginBottom:24, display:'flex', alignItems:'center', gap:32, flexWrap:'wrap' }}>
        <svg width="140" height="140" viewBox="0 0 128 128" style={{ flexShrink:0 }}>
          <circle cx="64" cy="64" r="54" fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle cx="64" cy="64" r="54" fill="none" stroke={ringColor} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={circumference - (overall/100)*circumference}
            strokeLinecap="round" transform="rotate(-90 64 64)" style={{ transition:'stroke-dashoffset 0.6s' }} />
          <text x="64" y="58" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="700" fontFamily="Syne,sans-serif">{overall}%</text>
          <text x="64" y="76" textAnchor="middle" fill="var(--muted)" fontSize="11" fontFamily="DM Sans,sans-serif">OVERALL</text>
        </svg>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:20, marginBottom:6 }}>Overall Compliance</div>
          <p style={{ color:'var(--muted)', fontSize:14, marginBottom:16 }}>{sections.filter(s=>s.score<80).length} section(s) need attention to reach 80%.</p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {[{label:'Good',val:sections.filter(s=>s.score>=80).length,color:'var(--green)'},{label:'Attention',val:sections.filter(s=>s.score>=50&&s.score<80).length,color:'var(--amber)'},{label:'Critical',val:sections.filter(s=>s.score<50).length,color:'var(--red)'}].map(x=>(
              <div key={x.label} style={{ background:'var(--surface2)', borderRadius:'var(--radius-sm)', padding:'10px 20px', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:x.color }}>{x.val}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
        {sections.map(sec => (
          <div key={sec.label} style={{ background:'var(--surface)', border:`1px solid var(--border)`, borderTop:`3px solid ${sec.color}`, borderRadius:'var(--radius)', padding:'16px 18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:14 }}>{sec.icon} {sec.label}</span>
              <span style={{ fontWeight:700, color: sec.score<50?'var(--red)':sec.score<80?'var(--amber)':'var(--green)' }}>{sec.score}%</span>
            </div>
            <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
              <div style={{ height:'100%', width:`${sec.score}%`, background:sec.color, borderRadius:2, transition:'width 0.6s' }} />
            </div>
            <div style={{ marginTop:8, fontSize:12, color:'var(--red)' }}>{sec.score < 50 ? '✗ Critical' : sec.score < 80 ? '! Needs attention' : '✓ Good'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Home View ─────────────────────────────────────────────────────
function HomeView({ items, details, onUpdate, onSaveDetails }) {
  const [localDetails, setLocalDetails] = useState(details)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLocalDetails(details) }, [details])

  async function save() {
    await onSaveDetails(localDetails)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', textAlign:'left', whiteSpace:'nowrap' }
  const td = { padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:14 }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>🏠 Home Compliance</h1>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>
            {items.filter(i => i.item_type==='date' ? ragFromDate(i.last_completed)==='current' : i.status==='done').length}/{items.length} compliant
          </span>
          <Pill status={items.length && items.filter(i=>i.item_type==='date'?ragFromDate(i.last_completed)==='current':i.status==='done').length/items.length >= 0.8 ? 'current' : 'overdue'} />
        </div>
      </div>

      {/* Home details */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:24, marginBottom:24 }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, marginBottom:16 }}>Home Details</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
          {[
            { label:'Registered Manager', key:'registered_manager' },
            { label:'Responsible Individual', key:'ri_name' },
            { label:'Ofsted Number', key:'ofsted_number' },
            { label:'Max Occupancy', key:'max_occupancy', type:'number' },
            { label:'Telephone', key:'phone' },
            { label:'Email', key:'email' },
          ].map(({ label, key, type='text' }) => (
            <div key={key}>
              <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>{label}</label>
              <input type={type} value={localDetails[key] || ''} onChange={e => setLocalDetails(d => ({ ...d, [key]: e.target.value }))}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', color:'var(--text)', fontSize:14, outline:'none', width:'100%' }} />
            </div>
          ))}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>Registered Address</label>
            <textarea value={localDetails.address || ''} onChange={e => setLocalDetails(d => ({ ...d, address: e.target.value }))} rows={2}
              style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 12px', color:'var(--text)', fontSize:14, outline:'none', width:'100%', resize:'vertical' }} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, marginTop:16 }}>
          {saved && <span style={{ color:'var(--green)', fontSize:13 }}>✓ Saved</span>}
          <button onClick={save} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Save Details</button>
        </div>
      </div>

      {/* Compliance table */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              <th style={th}>Type</th>
              <th style={th}>Last Completed</th>
              <th style={th}>Due Date</th>
              <th style={th}>Status</th>
              <th style={th}>Notes / Done</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const rag = item.item_type === 'date' ? ragFromDate(item.last_completed) : (item.status === 'done' ? 'done' : 'pending')
              const dueDate = item.last_completed ? new Date(item.last_completed) : null
              return (
                <tr key={item.id}>
                  <td style={{ ...td, fontWeight:500 }}>{item.label}</td>
                  <td style={td}>
                    {item.item_type === 'date'
                      ? <span style={{ background:'var(--surface2)', border:'1px solid var(--accent)', color:'var(--accent)', borderRadius:4, padding:'2px 8px', fontSize:12 }}>📅 {item.freq}</span>
                      : <span style={{ background:'var(--green-bg)', border:'1px solid var(--green)', color:'var(--green)', borderRadius:4, padding:'2px 8px', fontSize:12 }}>✅ Task</span>
                    }
                  </td>
                  <td style={td}>
                    {item.item_type === 'date'
                      ? <input type="date" value={item.last_completed || ''} onChange={e => onUpdate(item.id, 'last_completed', e.target.value)}
                          style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--text)', fontSize:13, outline:'none' }} />
                      : <span style={{ color:'var(--muted)' }}>N/A</span>
                    }
                  </td>
                  <td style={td}>
                    {dueDate ? <span style={{ color: rag==='overdue'?'var(--red)':rag==='due-soon'?'var(--amber)':'var(--muted)', fontSize:13 }}>—</span> : <span style={{ color:'var(--muted)' }}>—</span>}
                  </td>
                  <td style={td}><Pill status={rag} /></td>
                  <td style={td}>
                    {item.item_type === 'task'
                      ? <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div onClick={() => onUpdate(item.id, 'status', item.status==='done'?'pending':'done')}
                            style={{ width:36, height:20, borderRadius:10, background: item.status==='done'?'var(--green)':'var(--border)', cursor:'pointer', transition:'background 0.2s', position:'relative', flexShrink:0 }}>
                            <div style={{ position:'absolute', top:2, left: item.status==='done'?16:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
                          </div>
                          <span style={{ fontSize:13, color:'var(--muted)' }}>Mark done</span>
                        </div>
                      : <input type="text" value={item.notes || ''} onChange={e => onUpdate(item.id, 'notes', e.target.value)} placeholder="Notes..."
                          style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--text)', fontSize:13, outline:'none', width:'100%' }} />
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Children View ─────────────────────────────────────────────────
function ChildrenView({ children, onAdd, onUpdate, onDelete }) {
  const [selected, setSelected] = useState(0)
  const child = children[selected]

  const OFSTED_YEAR_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March']

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>👦 Children</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Child</button>
      </div>

      {children.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:48, textAlign:'center', color:'var(--muted)' }}>
          No children added yet. Click "+ Add Child" to get started.
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
            {children.map((c, i) => (
              <button key={c.id} onClick={() => setSelected(i)}
                style={{ background: selected===i ? 'var(--accent)' : 'transparent', color: selected===i ? '#fff' : 'var(--text)', border: selected===i ? 'none' : '1px solid var(--border)', borderRadius:20, padding:'7px 18px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {c.name}
              </button>
            ))}
          </div>

          {child && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <input value={child.name} onChange={e => onUpdate(child.id, 'name', e.target.value)}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px', color:'var(--text)', fontSize:16, fontWeight:600, outline:'none', maxWidth:260 }} />
                <span style={{ color:'var(--muted)', fontSize:14 }}>Edit name</span>
                <div style={{ flex:1 }} />
                <button onClick={() => onDelete(child.id)} style={{ background:'transparent', border:'1px solid var(--red)', color:'var(--red)', borderRadius:'var(--radius-sm)', padding:'6px 14px', fontSize:13, cursor:'pointer' }}>Remove</button>
              </div>

              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Placement Details</div>
              <div style={{ background:'var(--surface2)', borderRadius:'var(--radius)', overflow:'hidden', marginBottom:20 }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <tbody>
                    {[
                      { label:'Date of Birth', key:'date_of_birth', type:'date' },
                      { label:'Placement Start Date', key:'placement_start', type:'date' },
                      { label:'Placing Authority', key:'placing_authority', type:'text' },
                      { label:'Key Worker', key:'key_worker', type:'text' },
                      { label:'Risk Assessment Date', key:'risk_assessment_date', type:'date' },
                      { label:'GP Registration', key:'gp_registration', type:'date' },
                      { label:'Dentist Registration', key:'dentist_registration', type:'date' },
                      { label:'Optician Registration', key:'optician_registration', type:'date' },
                    ].map(({ label, key, type }) => (
                      <tr key={key} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 16px', fontSize:13, color:'var(--muted)', fontWeight:500, whiteSpace:'nowrap', width:220 }}>{label}</td>
                        <td style={{ padding:'6px 12px' }}>
                          <Input type={type} value={child[key]} onChange={v => onUpdate(child.id, key, v)} />
                        </td>
                        {type === 'date' && child[key] && (
                          <td style={{ padding:'6px 12px', width:120 }}>
                            <Pill status={ragFromDate(child[key], 90)} />
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'var(--muted)', fontWeight:500 }}>Consent Forms</td>
                      <td style={{ padding:'10px 12px' }}>
                        <Toggle value={child.consent_forms} onChange={v => onUpdate(child.id, 'consent_forms', v)} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'var(--muted)', fontWeight:500 }}>Delegation of Authority</td>
                      <td style={{ padding:'10px 12px' }}>
                        <Toggle value={child.delegation_of_authority} onChange={v => onUpdate(child.id, 'delegation_of_authority', v)} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Registrations & Documents</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:20 }}>
                {[
                  { label:'GP Registration', key:'gp_registration' },
                  { label:'Dentist Registration', key:'dentist_registration' },
                  { label:'Optician Registration', key:'optician_registration' },
                  { label:'Signed Consent Forms', key:'consent_forms', bool:true },
                  { label:'Delegation of Authority', key:'delegation_of_authority', bool:true },
                  { label:'Initial Placement Plan', key:'initial_placement_plan', bool:true },
                ].map(({ label, key, bool }) => (
                  <div key={key} style={{ background:'var(--surface2)', borderRadius:'var(--radius-sm)', padding:'12px 14px' }}>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>{label}</div>
                    {bool
                      ? <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Toggle value={child[key]} onChange={v => onUpdate(child.id, key, v)} />
                          <span style={{ fontSize:13, color: child[key] ? 'var(--green)' : 'var(--muted)' }}>{child[key] ? 'Complete' : 'Pending'}</span>
                        </div>
                      : <Pill status={ragFromDate(child[key], 90)} />
                    }
                  </div>
                ))}
              </div>

              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Monthly Tracker</div>
              <ChildMonthlyTracker childId={child.id} />

              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', margin:'20px 0 12px' }}>Care Documents & Meetings</div>
              <div style={{ background:'var(--surface2)', borderRadius:'var(--radius)', overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <tbody>
                    {[
                      { label:'PEP Date', key:'pep_date' },
                      { label:'LAC Review Date', key:'lac_date' },
                      { label:'EHCP Date', key:'ehcp_date' },
                      { label:'Care Plan Date', key:'care_plan_date' },
                    ].map(({ label, key }) => (
                      <tr key={key} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 16px', fontSize:13, color:'var(--muted)', fontWeight:500, width:220 }}>{label}</td>
                        <td style={{ padding:'6px 12px' }}>
                          <Input type="date" value={child[key]} onChange={v => onUpdate(child.id, key, v)} />
                        </td>
                        {child[key] && <td style={{ padding:'6px 12px' }}><Pill status={ragFromDate(child[key], 90)} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChildMonthlyTracker({ childId }) {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: rows } = await supabase.from('monthly_tracker').select('*').eq('child_id', childId)
      const map = {}
      for (const r of (rows || [])) map[r.month] = r
      setData(map)
      setLoading(false)
    }
    load()
  }, [childId])

  async function update(month, field, value) {
    const key = `${month}-01`
    const existing = data[key]
    if (existing) {
      await supabase.from('monthly_tracker').update({ [field]: parseInt(value) || 0 }).eq('id', existing.id)
      setData(prev => ({ ...prev, [key]: { ...existing, [field]: parseInt(value) || 0 } }))
    } else {
      const { data: row } = await supabase.from('monthly_tracker').insert({ child_id: childId, month: key, [field]: parseInt(value) || 0 }).select().single()
      if (row) setData(prev => ({ ...prev, [key]: row }))
    }
  }

  async function updateNotes(month, notes) {
    const key = `${month}-01`
    const existing = data[key]
    if (existing) {
      await supabase.from('monthly_tracker').update({ notes }).eq('id', existing.id)
      setData(prev => ({ ...prev, [key]: { ...existing, notes } }))
    }
  }

  if (loading) return <div style={{ color:'var(--muted)', fontSize:13, padding:12 }}>Loading tracker...</div>

  const now = new Date()
  const yearStart = now >= new Date(now.getFullYear(), 3, 1) ? now.getFullYear() : now.getFullYear() - 1
  const months = []
  for (let i = 3; i < 15; i++) {
    const d = new Date(yearStart, i % 12 === 0 ? 0 : i, 1)
    const y = i >= 12 ? yearStart + 1 : yearStart
    months.push({ label: new Date(y, i % 12 === 0 ? 0 : i % 12, 1).toLocaleString('en-GB', { month:'long' }), key: `${y}-${String((i%12===0?0:i%12)+1).padStart(2,'0')}` })
  }

  const th = { padding:'8px 12px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', borderBottom:'1px solid var(--border)', textAlign:'center', whiteSpace:'nowrap' }
  const td = { padding:'6px 8px', borderBottom:'1px solid var(--border)', textAlign:'center' }

  return (
    <div style={{ overflowX:'auto', background:'var(--surface2)', borderRadius:'var(--radius)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign:'left' }}>Month</th>
            <th style={th}>Incidents</th>
            <th style={th}>MFH</th>
            <th style={th}>PI</th>
            <th style={th}>Keywork Sessions</th>
            <th style={{ ...th, minWidth:160, textAlign:'left' }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {months.map(({ label, key }) => {
            const row = data[`${key}-01`] || {}
            return (
              <tr key={key}>
                <td style={{ ...td, textAlign:'left', fontWeight:500, padding:'6px 12px' }}>{label}</td>
                {['incidents','mfh','pi','keywork'].map(f => (
                  <td key={f} style={td}>
                    <input type="number" min="0" value={row[f] ?? ''} onChange={e => update(key, f, e.target.value)}
                      style={{ width:56, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 6px', color:'var(--text)', fontSize:13, outline:'none', textAlign:'center' }} />
                  </td>
                ))}
                <td style={{ ...td, textAlign:'left' }}>
                  <input type="text" value={row.notes || ''} onChange={e => updateNotes(key, e.target.value)} placeholder="Notes..."
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--text)', fontSize:13, outline:'none', width:'100%' }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Staff View ────────────────────────────────────────────────────
function StaffView({ staff, onAdd, onUpdate, onDelete }) {
  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:13 }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>👥 Staff</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Staff</button>
      </div>

      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Staff Register</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto', marginBottom:24 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead>
            <tr>
              {['Name','Role','Start Date','DBS No.','DBS Expiry','Photo ID 1','Photo ID 2','Proof of Addr','Driving Lic','Performance',''].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={11} style={{ ...td, textAlign:'center', color:'var(--muted)', padding:32 }}>No staff added yet</td></tr>
            ) : staff.map(member => (
              <tr key={member.id}>
                <td style={td}><Input value={member.name} onChange={v => onUpdate(member.id,'name',v)} /></td>
                <td style={td}><Input value={member.role} onChange={v => onUpdate(member.id,'role',v)} placeholder="e.g. RSW" /></td>
                <td style={td}><Input type="date" value={member.start_date} onChange={v => onUpdate(member.id,'start_date',v)} /></td>
                <td style={td}><Input value={member.dbs_number} onChange={v => onUpdate(member.id,'dbs_number',v)} placeholder="DBS no." /></td>
                <td style={td}>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <Input type="date" value={member.dbs_expiry} onChange={v => onUpdate(member.id,'dbs_expiry',v)} />
                    {member.dbs_expiry && <Pill status={ragFromDate(member.dbs_expiry, 90)} />}
                  </div>
                </td>
                {['photo_id_1','photo_id_2','proof_of_address','driving_licence'].map(key => (
                  <td key={key} style={{ ...td, textAlign:'center' }}>
                    <Toggle value={member[key]} onChange={v => onUpdate(member.id, key, v)} />
                  </td>
                ))}
                <td style={td}>
                  <select value={member.performance_rating || 'Satisfactory'} onChange={e => onUpdate(member.id,'performance_rating',e.target.value)}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--text)', fontSize:12, outline:'none', cursor:'pointer' }}>
                    {['Outstanding','Good','Satisfactory','Requires Improvement','Unsatisfactory'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <button onClick={() => onDelete(member.id)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Supervisions</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead>
            <tr>
              <th style={th}>Staff Name</th>
              <th style={th}>Type</th>
              {MONTHS_ALL.map(m => <th key={m} style={th}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={14} style={{ ...td, textAlign:'center', color:'var(--muted)', padding:24 }}>No staff added yet</td></tr>
            ) : staff.map(member => (
              <tr key={member.id}>
                <td style={{ ...td, fontWeight:500 }}>{member.name}</td>
                <td style={td}>
                  <select value={member.supervision_type || 'Monthly'} onChange={e => onUpdate(member.id,'supervision_type',e.target.value)}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:12, outline:'none' }}>
                    <option>Monthly</option><option>6 Weekly</option><option>Quarterly</option>
                  </select>
                </td>
                {MONTHS_ALL.map((m, i) => (
                  <td key={m} style={{ ...td, textAlign:'center' }}>
                    <input type="date" value={member[`supervision_${m.toLowerCase()}`] || ''}
                      onChange={e => onUpdate(member.id, `supervision_${m.toLowerCase()}`, e.target.value)}
                      style={{ width:120, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:11, outline:'none' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Training View ─────────────────────────────────────────────────
function TrainingView({ training, onAdd, onUpdate }) {
  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', textAlign:'center', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', textAlign:'center' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>📚 Training</h1>
        <button onClick={onAdd} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Staff</button>
      </div>

      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Mandatory Online</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto', marginBottom:24 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign:'left' }}>Staff Name</th>
              {TRAINING_COLS.map(c => <th key={c} style={th}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {training.length === 0 ? (
              <tr><td colSpan={TRAINING_COLS.length+1} style={{ ...td, color:'var(--muted)', padding:28 }}>No training records yet</td></tr>
            ) : training.map(row => (
              <tr key={row.id}>
                <td style={{ ...td, textAlign:'left', fontWeight:500, padding:'8px 14px' }}>{row.staff_name}</td>
                {TRAINING_COLS.map(col => {
                  const key = col.toLowerCase().replace(/[^a-z]/g,'_').replace(/__/g,'_')
                  const rag = ragFromDate(row[key], 90)
                  return (
                    <td key={col} style={td}>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
                        <input type="date" value={row[key] || ''} onChange={e => onUpdate(row.id, key, e.target.value)}
                          style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'4px 6px', color:'var(--text)', fontSize:12, outline:'none', width:120 }} />
                        {row[key] && <Pill status={rag} />}
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

// ─── Reg 40 View ───────────────────────────────────────────────────
function Reg40View({ userId }) {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('reg40_visits').select('*').eq('user_id', userId).order('visit_date', { ascending:false })
      setVisits(data || [])
      setLoading(false)
    }
    load()
  }, [userId])

  async function addVisit() {
    const { data } = await supabase.from('reg40_visits').insert({ user_id: userId, visit_date: new Date().toISOString().slice(0,10) }).select().single()
    if (data) setVisits(prev => [data, ...prev])
  }

  async function updateVisit(id, field, value) {
    await supabase.from('reg40_visits').update({ [field]: value }).eq('id', id)
    setVisits(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v))
  }

  const th = { padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:13 }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:700 }}>📋 Regulation 40</h1>
        <button onClick={addVisit} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'9px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Log Visit</button>
      </div>
      {loading ? <p style={{ color:'var(--muted)' }}>Loading...</p> : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
            <thead>
              <tr>
                {['Visit Date','Visit Type','Completed By','Rating','Actions/Outcomes','Report Submitted'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign:'center', color:'var(--muted)', padding:32 }}>No visits logged yet</td></tr>
              ) : visits.map(visit => (
                <tr key={visit.id}>
                  <td style={td}><Input type="date" value={visit.visit_date} onChange={v => updateVisit(visit.id,'visit_date',v)} /></td>
                  <td style={td}>
                    <select value={visit.visit_type||'Announced'} onChange={e => updateVisit(visit.id,'visit_type',e.target.value)}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 8px', color:'var(--text)', fontSize:13, outline:'none' }}>
                      <option>Announced</option><option>Unannounced</option>
                    </select>
                  </td>
                  <td style={td}><Input value={visit.completed_by} onChange={v => updateVisit(visit.id,'completed_by',v)} placeholder="RI name" /></td>
                  <td style={td}>
                    <select value={visit.rating||''} onChange={e => updateVisit(visit.id,'rating',e.target.value)}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'6px 8px', color:'var(--text)', fontSize:13, outline:'none' }}>
                      <option value="">Select...</option>
                      <option>Outstanding</option><option>Good</option><option>Requires Improvement</option><option>Inadequate</option>
                    </select>
                  </td>
                  <td style={td}><Input value={visit.outcomes} onChange={v => updateVisit(visit.id,'outcomes',v)} placeholder="Key actions..." /></td>
                  <td style={{ ...td, textAlign:'center' }}><Toggle value={visit.report_submitted} onChange={v => updateVisit(visit.id,'report_submitted',v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Feedback View ─────────────────────────────────────────────────
function FeedbackView({ userId, children }) {
  const [ypFeedback, setYpFeedback] = useState({})
  const [stakeholder, setStakeholder] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [yp, st] = await Promise.all([
        supabase.from('yp_feedback').select('*').eq('user_id', userId),
        supabase.from('stakeholder_feedback').select('*').eq('user_id', userId),
      ])
      const map = {}
      for (const r of (yp.data || [])) {
        if (!map[r.child_name]) map[r.child_name] = {}
        map[r.child_name][r.month] = r
      }
      setYpFeedback(map)
      setStakeholder(st.data || [])
      setLoading(false)
    }
    load()
  }, [userId])

  async function updateYp(childName, month, value) {
    const existing = ypFeedback[childName]?.[month]
    if (existing) {
      await supabase.from('yp_feedback').update({ completed: value }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('yp_feedback').insert({ user_id: userId, child_name: childName, month, completed: value }).select().single()
      if (data) setYpFeedback(prev => ({ ...prev, [childName]: { ...(prev[childName]||{}), [month]: data } }))
    }
    setYpFeedback(prev => ({ ...prev, [childName]: { ...(prev[childName]||{}), [month]: { ...(prev[childName]?.[month]||{}), completed: value } } }))
  }

  async function updateStakeholder(id, field, value) {
    await supabase.from('stakeholder_feedback').update({ [field]: value }).eq('id', id)
    setStakeholder(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const th = { padding:'10px 12px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', textAlign:'center', whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', borderBottom:'1px solid var(--border)', textAlign:'center' }

  const childNames = children.length > 0 ? children.map(c => c.name) : ['Child 1','Child 2','Child 3']

  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, marginBottom:24 }}>💬 Feedback</h1>

      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Young Person Feedback</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto', marginBottom:24 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign:'left' }}>Young Person</th>
              {MONTHS_ALL.map(m => <th key={m} style={th}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {childNames.map(name => (
              <tr key={name}>
                <td style={{ ...td, textAlign:'left', fontWeight:500, padding:'8px 14px' }}>{name}</td>
                {MONTHS_ALL.map(m => {
                  const val = ypFeedback[name]?.[m]?.completed
                  return (
                    <td key={m} style={td}>
                      <Toggle value={val} onChange={v => updateYp(name, m, v)} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--muted)', marginBottom:12 }}>Stakeholder Feedback</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
          <thead>
            <tr>
              {['Stakeholder','Date','Feedback Summary','Action Taken','Logged By'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {['Social Worker','Education','Police','Other'].map(stakeholderType => {
              const row = stakeholder.find(s => s.stakeholder_type === stakeholderType) || { stakeholder_type: stakeholderType }
              return (
                <tr key={stakeholderType}>
                  <td style={{ ...td, fontWeight:500, textAlign:'left', padding:'8px 14px' }}>{stakeholderType}</td>
                  <td style={td}><Input type="date" value={row.feedback_date} onChange={v => row.id ? updateStakeholder(row.id,'feedback_date',v) : null} /></td>
                  <td style={td}><Input value={row.summary} onChange={v => row.id ? updateStakeholder(row.id,'summary',v) : null} placeholder="Summary..." /></td>
                  <td style={td}><Input value={row.action_taken} onChange={v => row.id ? updateStakeholder(row.id,'action_taken',v) : null} placeholder="Action..." /></td>
                  <td style={td}><Input value={row.logged_by} onChange={v => row.id ? updateStakeholder(row.id,'logged_by',v) : null} placeholder="Name..." /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Shared components ─────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width:36, height:20, borderRadius:10, background: value ? 'var(--green)' : 'var(--border)', cursor:'pointer', transition:'background 0.2s', position:'relative', display:'inline-block', flexShrink:0 }}>
      <div style={{ position:'absolute', top:2, left: value ? 16 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
    </div>
  )
}

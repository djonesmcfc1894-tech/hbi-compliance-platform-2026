import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { email, password, homeName, trialDays } = req.body
  if (!email || !password || !homeName) return res.status(400).json({ error: 'Missing required fields' })

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (authError) throw authError

    const userId = authData.user.id
    const trialExpires = new Date()
    trialExpires.setDate(trialExpires.getDate() + (parseInt(trialDays) || 30))

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId, email, role: 'user', home_name: homeName,
      trial_expires_at: trialExpires.toISOString(), is_suspended: false
    })
    if (profileError) throw profileError

    return res.status(200).json({ success: true, userId })
  } catch (err) {
    console.error('Create user error:', err)
    return res.status(500).json({ error: err.message })
  }
}

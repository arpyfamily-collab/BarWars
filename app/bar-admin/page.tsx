'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'

/* ────────────────────────────────────────────────────────────────
 * Design tokens (match Bolt mock)
 * ────────────────────────────────────────────────────────────── */
const C = {
  bg: '#0A0A0C',
  panel: '#111114',
  panelBorder: 'rgba(255,255,255,0.06)',
  text: '#F5F5F5',
  textDim: '#9CA3AF',
  textFaint: '#6B7280',
  gold: '#C9A84C',
  goldSoft: 'rgba(201,168,76,0.15)',
  violet: '#7B2CBF',
  cyan: '#00F5D4',
  yellow: '#E0FF00',
  red: '#E03131',
  amber: '#F5B800',
  green: '#22C55E',
}

const TABS = [
  { id: 'flares',      label: 'Flares' },
  { id: 'bracelets',   label: 'Bracelets' },
  { id: 'specials',    label: 'War Specials' },
  { id: 'redemptions', label: 'Redemptions' },
  { id: 'analytics',   label: 'Analytics' },
] as const
type TabId = typeof TABS[number]['id']

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────── */
function mondayISO(d = new Date()): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m.toISOString().split('T')[0]
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)     return `${s}s ago`
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/* ────────────────────────────────────────────────────────────────
 * Root
 * ────────────────────────────────────────────────────────────── */
type Venue = { id: string; name: string }

export default function BarCommandCenter() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState<string>('')
  const [tab, setTab] = useState<TabId>('flares')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('bar_admins')
        .select('bar_id, venues:bar_id ( id, name )')
        .eq('user_id', user.id)

      const vs: Venue[] = (data ?? [])
        .map((r: any) => r.venues)
        .filter((v: any): v is Venue => Boolean(v?.id))

      setVenues(vs)
      if (vs.length > 0) setVenueId(vs[0].id)
      setLoading(false)
    })()
  }, [supabase])

  return (
    <div style={{ padding: '32px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: '0.15em',
          margin: 0,
          color: C.text,
          textTransform: 'uppercase',
        }}
      >
        Bar Command Center
      </h1>
      <p style={{ color: C.textDim, marginTop: 6, fontSize: 14 }}>
        Manage flares, bracelet drops, specials, and redemptions.
      </p>

      {/* Venue picker */}
      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ color: C.textDim, padding: 20 }}>Loading…</div>
        ) : venues.length === 0 ? (
          <EmptyState message="No venues linked to this account. Ask the operator to add you as a bar admin." />
        ) : (
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 18px',
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 8,
              color: C.text,
              fontSize: 15,
              outline: 'none',
            }}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {venueId && (
        <>
          {/* Tabs */}
          <div
            style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
              borderBottom: `1px solid ${C.panelBorder}`,
            }}
          >
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: active ? `2px solid ${C.violet}` : '2px solid transparent',
                    color: active ? C.text : C.textDim,
                    padding: '14px 8px',
                    fontSize: 12,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: 24 }}>
            {tab === 'flares'      && <FlaresTab venueId={venueId} userId={userId!} />}
            {tab === 'bracelets'   && <BraceletsTab venueId={venueId} userId={userId!} />}
            {tab === 'specials'    && <WarSpecialsTab venueId={venueId} userId={userId!} />}
            {tab === 'redemptions' && <RedemptionsTab venueId={venueId} />}
            {tab === 'analytics'   && <AnalyticsTab venueId={venueId} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * FLARES
 * ────────────────────────────────────────────────────────────── */
function FlaresTab({ venueId, userId }: { venueId: string; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [credits, setCredits] = useState<{
    earned_drops: number
    earned_special: number
    earned_sub: number
    earned_bounty: number
    spent: number
    balance: number | null
  } | null>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [offerText, setOfferText] = useState('')
  const [discountDesc, setDiscountDesc] = useState('')
  const [duration, setDuration] = useState(60)
  const [firing, setFiring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const wk = mondayISO()

    const [creditsRes, activeRes, historyRes] = await Promise.all([
      supabase
        .from('flare_credits')
        .select('earned_drops, earned_special, earned_sub, earned_bounty, spent, balance')
        .eq('venue_id', venueId)
        .eq('week_start', wk)
        .maybeSingle(),
      supabase
        .from('flares')
        .select('id, offer_text, discount_desc, duration_min, fired_at, expires_at, checkin_count, status')
        .eq('venue_id', venueId)
        .gte('fired_at', new Date(Date.now() - 4 * 3600 * 1000).toISOString())
        .order('fired_at', { ascending: false })
        .limit(1),
      supabase
        .from('flares')
        .select('id, offer_text, discount_desc, duration_min, fired_at, expires_at, checkin_count, status')
        .eq('venue_id', venueId)
        .order('fired_at', { ascending: false })
        .limit(10),
    ])

    setCredits(
      creditsRes.data ?? {
        earned_drops: 0, earned_special: 0, earned_sub: 0, earned_bounty: 0,
        spent: 0, balance: null,
      }
    )
    setRecent(activeRes.data ?? [])
    setHistory(historyRes.data ?? [])
  }, [supabase, venueId])

  useEffect(() => { reload() }, [reload])

  const earned = credits
    ? credits.earned_drops + credits.earned_special + credits.earned_sub + credits.earned_bounty
    : 0
  const spent = credits?.spent ?? 0
  const remaining = credits?.balance ?? Math.max(0, earned - spent)

  const cooldownActive = recent.length > 0
  const cooldownEnd = cooldownActive
    ? new Date(new Date(recent[0].fired_at).getTime() + 4 * 3600 * 1000)
    : null

  async function fireFlare() {
    setError(null)
    setSuccess(null)
    if (!offerText.trim() || !discountDesc.trim()) {
      setError('Offer text and discount description are required.')
      return
    }
    setFiring(true)
    try {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/flare-fire`
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          venue_id: venueId,
          fired_by: userId,
          offer_text: offerText.trim(),
          discount_desc: discountDesc.trim(),
          duration_min: duration,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Fire failed (${res.status})`)
      setSuccess('Flare fired. Students within range are getting the push now.')
      setOfferText('')
      setDiscountDesc('')
      setDuration(60)
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setFiring(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Credit balance */}
      <Panel accent={C.gold}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ color: C.gold }}>⚡</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Flare Credit Balance</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.textDim }}>
            Week of {mondayISO()}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Stat value={earned} label="Earned" color={C.green} />
          <Stat value={spent} label="Spent" color={C.red} />
          <Stat value={remaining} label="Remaining" color={C.gold} />
        </div>
        {earned === 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: C.textFaint }}>
            Earn flares by: winning best War Special ({credits?.earned_special ?? 0}), most bracelet drops
            ({credits?.earned_drops ?? 0}), subscription tier ({credits?.earned_sub ?? 0}), or completing
            bounties ({credits?.earned_bounty ?? 0}).
          </div>
        )}
      </Panel>

      {/* Fire form */}
      <Panel>
        <SectionTitle icon="🔥" title="Fire a Flare" />
        {cooldownActive && cooldownEnd && (
          <Alert kind="warn">
            Last flare fired {timeAgo(recent[0].fired_at)}. Cooldown clears at{' '}
            {cooldownEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          </Alert>
        )}
        <Field label="Offer Text">
          <input
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            placeholder="No cover + $3 wells"
            maxLength={80}
            style={inputStyle}
          />
        </Field>
        <Field label="Discount Description">
          <input
            value={discountDesc}
            onChange={(e) => setDiscountDesc(e.target.value)}
            placeholder="50% off cover, $3 well drinks"
            maxLength={160}
            style={inputStyle}
          />
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min={15}
            max={240}
            value={duration}
            onChange={(e) => setDuration(Math.max(15, Math.min(240, Number(e.target.value) || 60)))}
            style={inputStyle}
          />
        </Field>
        {error   && <Alert kind="error">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <button
          onClick={fireFlare}
          disabled={firing || cooldownActive || remaining <= 0}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '14px',
            background:
              firing || cooldownActive || remaining <= 0
                ? 'rgba(201,168,76,0.3)'
                : C.gold,
            color: '#0A0A0C',
            fontWeight: 700,
            letterSpacing: '0.15em',
            border: 'none',
            borderRadius: 6,
            cursor: firing || cooldownActive || remaining <= 0 ? 'not-allowed' : 'pointer',
            fontSize: 13,
            textTransform: 'uppercase',
          }}
        >
          {firing
            ? 'Firing…'
            : cooldownActive
            ? 'Cooldown Active'
            : remaining <= 0
            ? 'No Credits Remaining'
            : 'Fire Flare'}
        </button>
      </Panel>

      {/* History */}
      <Panel>
        <SectionTitle title="Flare History" />
        {history.length === 0 ? (
          <div style={{ color: C.textFaint, padding: 20, textAlign: 'center' }}>
            No flares fired yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((f) => {
              const expired = new Date(f.expires_at) < new Date()
              return (
                <div
                  key={f.id}
                  style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    border: `1px solid ${C.panelBorder}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600 }}>{f.offer_text}</div>
                    <Badge kind={expired ? 'dim' : 'gold'}>
                      {expired ? 'Expired' : 'Active'}
                    </Badge>
                  </div>
                  <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>
                    {f.discount_desc}
                  </div>
                  <div style={{ color: C.textFaint, fontSize: 12, marginTop: 6 }}>
                    Fired {timeAgo(f.fired_at)} · {f.duration_min}min ·{' '}
                    {f.checkin_count ?? 0} check-ins
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * BRACELETS
 * ────────────────────────────────────────────────────────────── */
function BraceletsTab({ venueId, userId }: { venueId: string; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [thisWeek, setThisWeek] = useState(0)
  const [active, setActive] = useState<any[]>([])
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [offerType, setOfferType] = useState<'no_cover' | 'drink' | 'other'>('no_cover')
  const [offerValue, setOfferValue] = useState('')
  const [release2, setRelease2] = useState('')
  const [release3, setRelease3] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const wk = mondayISO()
    const [countRes, activeRes] = await Promise.all([
      supabase
        .from('bracelet_drops')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('drop_week', wk),
      supabase
        .from('bracelet_drops')
        .select('id, clue_1, offer_type, offer_value, status, hidden_at, found_at')
        .eq('venue_id', venueId)
        .order('hidden_at', { ascending: false })
        .limit(10),
    ])
    setThisWeek(countRes.count ?? 0)
    setActive(activeRes.data ?? [])
  }, [supabase, venueId])

  useEffect(() => { reload() }, [reload])

  async function hideBracelet() {
    setError(null)
    setSuccess(null)
    if (!clue1.trim()) {
      setError('Clue 1 is required.')
      return
    }
    setSaving(true)
    try {
      const { error: insErr } = await supabase.from('bracelet_drops').insert({
        venue_id: venueId,
        clue_1: clue1.trim(),
        clue_2: clue2.trim() || null,
        clue_3: clue3.trim() || null,
        clue_2_released_at: release2 ? new Date(release2).toISOString() : null,
        clue_3_released_at: release3 ? new Date(release3).toISOString() : null,
        offer_type: offerType,
        offer_value: offerValue.trim() || null,
        status: 'hidden',
        hidden_by: userId,
        drop_week: mondayISO(),
      })
      if (insErr) throw insErr
      setSuccess('Bracelet hidden. Clue 1 is live now.')
      setClue1(''); setClue2(''); setClue3('')
      setOfferValue(''); setRelease2(''); setRelease3('')
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel accent={C.yellow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <div>
            You&apos;ve dropped <strong style={{ color: C.yellow }}>{thisWeek}</strong>{' '}
            bracelet{thisWeek === 1 ? '' : 's'} this week.
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle icon="🎁" title="Hide a Bracelet" />
        <Field label="Clue 1 (visible immediately)">
          <input value={clue1} onChange={(e) => setClue1(e.target.value)} placeholder="It's near the front door..." style={inputStyle} />
        </Field>
        <Field label="Clue 2 (optional)">
          <input value={clue2} onChange={(e) => setClue2(e.target.value)} placeholder="Look up, not down..." style={inputStyle} />
        </Field>
        <Field label="Clue 3 (optional)">
          <input value={clue3} onChange={(e) => setClue3(e.target.value)} placeholder="It's taped under the bar rail..." style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Offer Type">
            <select value={offerType} onChange={(e) => setOfferType(e.target.value as any)} style={inputStyle}>
              <option value="no_cover">No Cover</option>
              <option value="drink">Free/Discounted Drink</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Offer Value">
            <input value={offerValue} onChange={(e) => setOfferValue(e.target.value)} placeholder="$10" style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Clue 2 Release (optional)">
            <input type="datetime-local" value={release2} onChange={(e) => setRelease2(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Clue 3 Release (optional)">
            <input type="datetime-local" value={release3} onChange={(e) => setRelease3(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        {error   && <Alert kind="error">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <button
          onClick={hideBracelet}
          disabled={saving}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '14px',
            background: saving ? 'rgba(224,255,0,0.3)' : C.yellow,
            color: '#0A0A0C',
            fontWeight: 700,
            letterSpacing: '0.15em',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            textTransform: 'uppercase',
          }}
        >
          {saving ? 'Hiding…' : 'Hide Bracelet'}
        </button>
      </Panel>

      <Panel>
        <SectionTitle title={`Recent Drops (${active.length})`} />
        {active.length === 0 ? (
          <div style={{ color: C.textFaint, padding: 20, textAlign: 'center' }}>
            No bracelets hidden yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: 14,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6,
                  border: `1px solid ${C.panelBorder}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{b.clue_1}</div>
                  <div style={{ color: C.textFaint, fontSize: 12, marginTop: 4 }}>
                    Hidden {timeAgo(b.hidden_at)}
                    {b.found_at && ` · Found ${timeAgo(b.found_at)}`}
                  </div>
                </div>
                <Badge
                  kind={
                    b.status === 'found'    ? 'green' :
                    b.status === 'hidden'   ? 'yellow' :
                    b.status === 'donated'  ? 'violet' : 'dim'
                  }
                >
                  {String(b.status).toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * WAR SPECIALS
 * ────────────────────────────────────────────────────────────── */
function WarSpecialsTab({ venueId, userId }: { venueId: string; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<any[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [runDate, setRunDate] = useState('')
  const [startTime, setStartTime] = useState('20:00')
  const [endTime, setEndTime] = useState('23:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('war_specials')
      .select('id, special_name, description, run_date, start_time, end_time, status, checkin_count, student_votes, flares_awarded, created_at')
      .eq('venue_id', venueId)
      .order('run_date', { ascending: false })
      .limit(20)
    setRows(data ?? [])
  }, [supabase, venueId])

  useEffect(() => { reload() }, [reload])

  async function submit() {
    setError(null); setSuccess(null)
    if (!name.trim() || !description.trim() || !runDate) {
      setError('Name, description, and run date are required.')
      return
    }
    setSaving(true)
    try {
      const runDateObj = new Date(runDate + 'T00:00:00')
      const { error: insErr } = await supabase.from('war_specials').insert({
        venue_id: venueId,
        submitted_by: userId,
        special_name: name.trim(),
        description: description.trim(),
        run_date: runDate,
        start_time: startTime,
        end_time: endTime,
        status: 'submitted',
        week_start: mondayISO(runDateObj),
      })
      if (insErr) throw insErr
      setSuccess('Special submitted. Students vote all week — top vote wins bonus flares.')
      setName(''); setDescription(''); setRunDate('')
      setStartTime('20:00'); setEndTime('23:00')
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel>
        <SectionTitle icon="🍺" title="Submit a War Special" />
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
          Out-of-the-norm specials only. Standard promos don&apos;t qualify. Weekly winner earns 2 bonus flares.
        </div>
        <Field label="Special Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chug-and-Chuck Tuesday" maxLength={80} style={inputStyle} />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Free t-shirt for anyone who chugs a pint and hits the dartboard bullseye."
            maxLength={500}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Run Date">
            <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Start">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        {error   && <Alert kind="error">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <button
          onClick={submit}
          disabled={saving}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '14px',
            background: saving ? 'rgba(123,44,191,0.4)' : C.violet,
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '0.15em',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            textTransform: 'uppercase',
          }}
        >
          {saving ? 'Submitting…' : 'Submit Special'}
        </button>
      </Panel>

      <Panel>
        <SectionTitle title="Your Specials" />
        {rows.length === 0 ? (
          <div style={{ color: C.textFaint, padding: 20, textAlign: 'center' }}>
            No specials submitted yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((s) => (
              <div key={s.id} style={{ padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${C.panelBorder}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.special_name}</div>
                    <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{s.description}</div>
                    <div style={{ color: C.textFaint, fontSize: 12, marginTop: 6 }}>
                      {s.run_date} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}
                    </div>
                  </div>
                  <Badge
                    kind={
                      s.status === 'approved' ? 'green' :
                      s.status === 'winner'   ? 'gold' :
                      s.status === 'flagged'  ? 'red' : 'dim'
                    }
                  >
                    {String(s.status).toUpperCase()}
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12, color: C.textDim }}>
                  <span>🗳 {s.student_votes} votes</span>
                  <span>✅ {s.checkin_count} check-ins</span>
                  {s.flares_awarded > 0 && (
                    <span style={{ color: C.gold }}>⚡ +{s.flares_awarded} flares</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * REDEMPTIONS
 * ────────────────────────────────────────────────────────────── */
function RedemptionsTab({ venueId }: { venueId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [offers, setOffers] = useState<any[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState(50)
  const [maxPerUser, setMaxPerUser] = useState(1)
  const [maxPerNight, setMaxPerNight] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('war_bond_redemption_offers')
      .select('id, name, description, valor_cost, max_per_user, max_per_night, claimed_count, active, created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
    setOffers(data ?? [])
  }, [supabase, venueId])

  useEffect(() => { reload() }, [reload])

  async function create() {
    setError(null); setSuccess(null)
    if (!name.trim() || cost < 1) {
      setError('Name and a positive cost are required.')
      return
    }
    setSaving(true)
    try {
      const { error: insErr } = await supabase.from('war_bond_redemption_offers').insert({
        venue_id: venueId,
        name: name.trim(),
        description: description.trim() || null,
        valor_cost: cost,
        max_per_user: maxPerUser,
        max_per_night: maxPerNight === '' ? null : maxPerNight,
        active: true,
      })
      if (insErr) throw insErr
      setSuccess('Offer live. Students can redeem now.')
      setName(''); setDescription(''); setCost(50); setMaxPerUser(1); setMaxPerNight('')
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(id: string, currentActive: boolean) {
    await supabase.from('war_bond_redemption_offers').update({ active: !currentActive }).eq('id', id)
    await reload()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel>
        <SectionTitle icon="💎" title="New Redemption Offer" />
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
          Students spend Valor Bonds at your bar. Set the ask, cap the volume.
        </div>
        <Field label="Offer Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Free well drink" maxLength={80} style={inputStyle} />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any well liquor, one per person" maxLength={200} style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Valor Cost">
            <input type="number" min={1} value={cost} onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
          </Field>
          <Field label="Max / User">
            <input type="number" min={1} value={maxPerUser} onChange={(e) => setMaxPerUser(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
          </Field>
          <Field label="Max / Night (optional)">
            <input type="number" min={1} value={maxPerNight} onChange={(e) => setMaxPerNight(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))} placeholder="No cap" style={inputStyle} />
          </Field>
        </div>
        {error   && <Alert kind="error">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <button
          onClick={create}
          disabled={saving}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '14px',
            background: saving ? 'rgba(0,245,212,0.3)' : C.cyan,
            color: '#0A0A0C',
            fontWeight: 700,
            letterSpacing: '0.15em',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            textTransform: 'uppercase',
          }}
        >
          {saving ? 'Creating…' : 'Create Offer'}
        </button>
      </Panel>

      <Panel>
        <SectionTitle title={`Live Offers (${offers.filter((o) => o.active).length})`} />
        {offers.length === 0 ? (
          <div style={{ color: C.textFaint, padding: 20, textAlign: 'center' }}>
            No redemption offers yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {offers.map((o) => (
              <div key={o.id} style={{ padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${C.panelBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {o.name}{' '}
                    <span style={{ color: C.cyan, fontWeight: 400, fontSize: 13 }}>
                      · {o.valor_cost} valor
                    </span>
                  </div>
                  {o.description && (
                    <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{o.description}</div>
                  )}
                  <div style={{ color: C.textFaint, fontSize: 12, marginTop: 6 }}>
                    {o.claimed_count} claimed · max {o.max_per_user}/user
                    {o.max_per_night && ` · ${o.max_per_night}/night`}
                  </div>
                </div>
                <button
                  onClick={() => toggle(o.id, o.active)}
                  style={{
                    background: o.active ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                    color: o.active ? C.green : C.textDim,
                    border: `1px solid ${o.active ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.4)'}`,
                    padding: '6px 14px',
                    borderRadius: 4,
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {o.active ? 'Active' : 'Paused'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * ANALYTICS
 * ────────────────────────────────────────────────────────────── */
function AnalyticsTab({ venueId }: { venueId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<{
    flares: number
    bracelets: number
    bracelets_found: number
    specials: number
    turf_checkins: number
    active_offers: number
  } | null>(null)

  useEffect(() => {
    ;(async () => {
      const wk = mondayISO()
      const [flares, bracelets, found, specials, checkins, offers] = await Promise.all([
        supabase.from('flares').select('id', { count: 'exact', head: true })
          .eq('venue_id', venueId).gte('fired_at', wk),
        supabase.from('bracelet_drops').select('id', { count: 'exact', head: true })
          .eq('venue_id', venueId).eq('drop_week', wk),
        supabase.from('bracelet_drops').select('id', { count: 'exact', head: true })
          .eq('venue_id', venueId).eq('drop_week', wk).not('found_at', 'is', null),
        supabase.from('war_specials').select('id', { count: 'exact', head: true })
          .eq('venue_id', venueId).eq('week_start', wk),
        supabase.from('turf_checkins').select('id', { count: 'exact', head: true })
          .eq('bar_id', venueId).gte('verified_at', wk),
        supabase.from('war_bond_redemption_offers').select('id', { count: 'exact', head: true })
          .eq('venue_id', venueId).eq('active', true),
      ])
      setStats({
        flares:          flares.count ?? 0,
        bracelets:       bracelets.count ?? 0,
        bracelets_found: found.count ?? 0,
        specials:        specials.count ?? 0,
        turf_checkins:   checkins.count ?? 0,
        active_offers:   offers.count ?? 0,
      })
    })()
  }, [supabase, venueId])

  if (!stats) return <div style={{ color: C.textDim, padding: 20 }}>Loading analytics…</div>

  const findRate = stats.bracelets > 0
    ? Math.round((stats.bracelets_found / stats.bracelets) * 100)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 12, color: C.textDim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Week of {mondayISO()}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <StatCard label="Flares Fired" value={stats.flares} color={C.gold} />
        <StatCard label="Bracelets Hidden" value={stats.bracelets} color={C.yellow} />
        <StatCard label="Bracelets Found" value={stats.bracelets_found} subtext={`${findRate}% find rate`} color={C.green} />
        <StatCard label="War Specials" value={stats.specials} color={C.violet} />
        <StatCard label="Turf Check-ins" value={stats.turf_checkins} color={C.cyan} />
        <StatCard label="Active Redemptions" value={stats.active_offers} color={C.cyan} />
      </div>
      <Panel>
        <div style={{ padding: 20, color: C.textFaint, fontSize: 13, textAlign: 'center' }}>
          Deeper analytics — foot-traffic heatmaps, hourly demand curves, redemption funnels — coming after beta.
        </div>
      </Panel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Shared UI primitives
 * ────────────────────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${C.panelBorder}`,
  borderRadius: 6,
  color: C.text,
  fontSize: 14,
  outline: 'none',
}

function Panel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderLeft: accent ? `3px solid ${accent}` : `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 20,
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ icon, title }: { icon?: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 600, fontSize: 15 }}>
      {icon && <span>{icon}</span>}
      <span>{title}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textDim, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 36, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.textDim, marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}

function StatCard({ label, value, subtext, color }: { label: string; value: number; subtext?: string; color: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textDim, marginTop: 6 }}>
        {label}
      </div>
      {subtext && (
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>{subtext}</div>
      )}
    </div>
  )
}

function Alert({ kind, children }: { kind: 'error' | 'warn' | 'success'; children: React.ReactNode }) {
  const styles = {
    error:   { bg: 'rgba(224,49,49,0.1)',  border: 'rgba(224,49,49,0.3)',  color: C.red },
    warn:    { bg: 'rgba(245,184,0,0.1)',  border: 'rgba(245,184,0,0.3)',  color: C.amber },
    success: { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  color: C.green },
  }[kind]
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 14px',
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 6,
        color: styles.color,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  )
}

function Badge({ kind, children }: { kind: 'gold' | 'green' | 'red' | 'violet' | 'yellow' | 'dim'; children: React.ReactNode }) {
  const map = {
    gold:   { bg: 'rgba(201,168,76,0.15)', color: C.gold },
    green:  { bg: 'rgba(34,197,94,0.15)',  color: C.green },
    red:    { bg: 'rgba(224,49,49,0.15)',  color: C.red },
    violet: { bg: 'rgba(123,44,191,0.2)',  color: '#C29CF5' },
    yellow: { bg: 'rgba(224,255,0,0.15)',  color: C.yellow },
    dim:    { bg: 'rgba(107,114,128,0.15)', color: C.textDim },
  }[kind]
  return (
    <span
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        background: map.bg,
        color: map.color,
        fontSize: 10,
        letterSpacing: '0.1em',
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: 'center',
        background: C.panel,
        border: `1px dashed ${C.panelBorder}`,
        borderRadius: 8,
        color: C.textDim,
      }}
    >
      {message}
    </div>
  )
}

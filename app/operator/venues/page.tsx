import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export const revalidate = 30

export default async function OperatorVenuesPage() {
  const supabase = createServerSupabaseClient()

  const { data: venues } = await supabase
    .from('venues')
    .select(`
      id, name, slug, total_capacity,
      wins, losses, current_streak, forfeit_unpaid_count,
      bar_admins(user_id, profiles!inner(full_name, id))
    `)
    .order('wins', { ascending: false })

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em' }}>
          Venues
        </h1>
        <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
          {venues?.length ?? 0} venues registered
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(venues ?? []).map((v: any) => {
          const admins = v.bar_admins ?? []
          return (
            <div key={v.id} style={{
              background:   'var(--bw-card)',
              border:       `1px solid ${v.forfeit_unpaid_count > 0 ? 'rgba(224,49,49,0.35)' : 'var(--bw-border)'}`,
              borderRadius: 12,
              padding:      '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 2 }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                    Capacity: {v.total_capacity} · {v.wins}W – {v.losses}L
                    {v.current_streak !== 0 && (
                      <span style={{ marginLeft: 8, color: v.current_streak > 0 ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                        {v.current_streak > 0 ? `${v.current_streak} win streak` : `${Math.abs(v.current_streak)} loss streak`}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {v.forfeit_unpaid_count > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-red)', background: 'rgba(224,49,49,0.12)', padding: '3px 8px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {v.forfeit_unpaid_count} unpaid
                    </span>
                  )}
                  <Link href={`/operator/challenges?filter=all&bar_id=${v.id}`}>
                    <span style={{ fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer' }}>
                      View history →
                    </span>
                  </Link>
                </div>
              </div>

              {/* Admins */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8 }}>
                  Bar admins
                </div>
                {admins.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--bw-muted)', fontStyle: 'italic' }}>
                    No admins assigned — add one below
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {admins.map((a: any) => (
                      <AdminChip
                        key={a.user_id}
                        name={a.profiles?.full_name ?? a.user_id}
                        venueId={v.id}
                        userId={a.user_id}
                      />
                    ))}
                  </div>
                )}
                <AddAdminForm venueId={v.id} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AdminChip({ name, venueId, userId }: { name: string; venueId: string; userId: string }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          6,
      background:   'var(--bw-surface)',
      border:       '1px solid var(--bw-border)',
      borderRadius: 20,
      padding:      '4px 10px 4px 12px',
      fontSize:     12,
    }}>
      <span style={{ color: 'var(--bw-text)' }}>{name}</span>
      <form action={`/api/operator/venues/${venueId}/admins/${userId}`} method="POST">
        <input type="hidden" name="_method" value="DELETE" />
        <button
          type="submit"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-muted)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
          title="Remove admin"
        >
          ×
        </button>
      </form>
    </div>
  )
}

function AddAdminForm({ venueId }: { venueId: string }) {
  return (
    <form action={`/api/operator/venues/${venueId}/admins`} method="POST" style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
      <input
        className="input"
        name="email"
        type="email"
        placeholder="admin@email.com"
        style={{ fontSize: 12, padding: '7px 10px' }}
        required
      />
      <button
        type="submit"
        style={{
          padding:      '7px 14px',
          background:   'transparent',
          border:       '1px solid var(--bw-border)',
          borderRadius: 8,
          color:        'var(--bw-muted)',
          fontSize:     12,
          cursor:       'pointer',
          whiteSpace:   'nowrap',
        }}
      >
        Add admin
      </button>
    </form>
  )
}

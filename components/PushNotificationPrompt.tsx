'use client'
/**
 * PushNotificationPrompt
 *
 * Shown on the account page. Handles all four states:
 *   idle      → "Enable notifications" button
 *   requesting → spinner
 *   registered → green confirmation, opt-out link
 *   denied    → browser instructions to re-enable
 *   unsupported → silent (don't show on non-supporting browsers)
 */

import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function PushNotificationPrompt() {
  const { status, prompt, reset } = usePushNotifications()

  if (status === 'unsupported') return null

  return (
    <div style={{
      background:   'var(--bw-card)',
      border:       `1px solid ${
        status === 'registered' ? 'rgba(46,204,113,0.3)'
        : status === 'denied'  ? 'rgba(224,49,49,0.25)'
        :                        'var(--bw-border)'
      }`,
      borderRadius: 'var(--bw-radius-lg)',
      padding:      '18px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
        Notifications
      </div>

      {status === 'idle' && (
        <div>
          <div style={{ fontSize: 14, color: 'var(--bw-text)', fontWeight: 600, marginBottom: 4 }}>
            Stay in the fight
          </div>
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Get notified when a war is declared, when your bar is losing ground, and when a fire sale drops near you.
          </div>
          <button className="btn btn-primary" onClick={prompt} style={{ fontSize: 14 }}>
            Enable notifications
          </button>
        </div>
      )}

      {status === 'requesting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--bw-muted)' }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid var(--bw-border)',
            borderTopColor: 'var(--bw-gold)',
            animation: 'spin 0.8s linear infinite',
          }} />
          Registering…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {status === 'registered' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-green)' }}>Notifications on</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
            You'll hear about wars, fire sales, and drops the moment they happen.
          </div>
          <button
            onClick={reset}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Turn off notifications
          </button>
        </div>
      )}

      {status === 'denied' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>🔕</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-red)' }}>Notifications blocked</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
            Your browser has blocked notifications for this site. To re-enable:
            tap the lock icon in your address bar → Notifications → Allow.
          </div>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--bw-red)', marginBottom: 10 }}>
            Something went wrong registering for notifications.
          </div>
          <button className="btn btn-ghost" onClick={prompt} style={{ fontSize: 13 }}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

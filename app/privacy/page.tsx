import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — BarWars',
  description: 'BarWars Privacy Policy',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: 'var(--bw-muted)', textDecoration: 'none', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          PRIVACY POLICY
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 120 }}>
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 8 }}>
          Last updated: September 24, 2026
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="1. Introduction">
            BarWars (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates a nightlife engagement and competition platform
            for college students (&ldquo;the Service&rdquo;). This Privacy Policy explains how we collect, use, and
            protect your personal information when you use our mobile application and website at
            barwars.app and related domains. By creating an account or using the Service, you agree
            to the practices described in this policy.
          </Section>

          <Section title="2. Information We Collect">
            <p style={p}>We collect the following categories of personal information:</p>
            <Bullet><strong>Account information:</strong> Full name, email address, phone number, and password (hashed). You must provide this to create an account.</Bullet>
            <Bullet><strong>Profile information:</strong> Your .edu email for student verification, Greek organization membership, and optional profile photo.</Bullet>
            <Bullet><strong>Device information:</strong> Device identifier, device type, operating system version, and push notification token. Used for anti-fraud verification and notifications.</Bullet>
            <Bullet><strong>Location data:</strong> Approximate location (city-level) when you participate in geo-based challenges or check in at venues. We do not continuously track your location.</Bullet>
            <Bullet><strong>Payment information:</strong> When you purchase passes or make in-app transactions, payment processing is handled by Stripe. We do not store full card numbers &mdash; Stripe tokenizes and securely stores your payment data.</Bullet>
            <Bullet><strong>Usage data:</strong> Which features you use, events you join, challenges you participate in, and messages you send through War Comms channels.</Bullet>
          </Section>

          <Section title="3. How We Use Your Information">
            <p style={p}>We use your information to:</p>
            <Bullet>Provide, maintain, and improve the Service, including venue challenges, turf wars, and leaderboard features.</Bullet>
            <Bullet>Verify your identity and student status through device, phone, and .edu email verification.</Bullet>
            <Bullet>Process payments for event passes, skip-the-line features, and in-app purchases via Stripe.</Bullet>
            <Bullet>Send you push notifications about live battles, rally calls, fire sales, and event reminders. You can manage notification preferences in your account settings.</Bullet>
            <Bullet>Facilitate communication through War Comms channels between you and your organization members.</Bullet>
            <Bullet>Detect, prevent, and address fraud, abuse, and violations of our Terms of Service.</Bullet>
            <Bullet>Comply with legal obligations and respond to law enforcement requests when required.</Bullet>
          </Section>

          <Section title="4. Information Sharing & Disclosure">
            <p style={p}>We do not sell your personal information. We may share your information with:</p>
            <Bullet><strong>Venue partners:</strong> Bars and venues you check into may receive your name and pass information to verify your entry. They do not receive your contact information.</Bullet>
            <Bullet><strong>Greek organization admins:</strong> Admins of your organization can see your membership status and participation in org-specific features.</Bullet>
            <Bullet><strong>Service providers:</strong> Stripe (payments), Firebase (push notifications), and Supabase (database hosting) process data on our behalf under their own privacy and security standards.</Bullet>
            <Bullet><strong>Legal compliance:</strong> We may disclose information when required by law, court order, or government regulation, or to protect the rights, property, or safety of our users.</Bullet>
          </Section>

          <Section title="5. Data Retention">
            We retain your account information for as long as your account is active. If you delete
            your account, we remove your personal data within 30 days, except where retention is
            required by law (e.g., financial transaction records, which are retained for 7 years per
            tax regulations). Aggregate and anonymized usage data may be retained indefinitely.
          </Section>

          <Section title="6. Your Privacy Rights">
            <p style={p}>Depending on your jurisdiction, you may have the right to:</p>
            <Bullet><strong>Access</strong> the personal information we hold about you.</Bullet>
            <Bullet><strong>Request correction</strong> of inaccurate personal information.</Bullet>
            <Bullet><strong>Request deletion</strong> of your personal information, subject to legal retention requirements.</Bullet>
            <Bullet><strong>Opt out</strong> of push notifications at any time via your device settings or in-app preferences.</Bullet>
            <Bullet><strong>Export</strong> a copy of your personal data in a portable format.</Bullet>
            <p style={{ ...p, marginTop: 12 }}>
              To exercise any of these rights, email us at{' '}
              <a href="mailto:support@barwars.app" style={{ color: 'var(--bw-violet-soft)', textDecoration: 'underline' }}>
                support@barwars.app
              </a>.
            </p>
          </Section>

          <Section title="7. Children&rsquo;s Privacy">
            The Service is intended for individuals 18 years of age or older who are enrolled college
            students. We do not knowingly collect personal information from children under 18. If you
            believe we have collected information from a minor, please contact us and we will promptly
            delete it.
          </Section>

          <Section title="8. Data Security">
            We take reasonable measures to protect your personal information using industry-standard
            practices including encrypted data transmission (TLS), hashed passwords, row-level
            security on our database, and restricted internal access. However, no method of
            transmission or storage is 100% secure. We cannot guarantee absolute security but we are
            committed to protecting your data.
          </Section>

          <Section title="9. Third-Party Services">
            The Service integrates with the following third-party providers, each governed by their
            own privacy policies:
            <ul style={{ paddingLeft: 20, marginTop: 8, color: 'var(--bw-muted)', fontSize: 13, lineHeight: 1.7 }}>
              <li><strong>Stripe</strong> &mdash; Payment processing. See stripe.com/privacy</li>
              <li><strong>Supabase</strong> &mdash; Database and authentication hosting. See supabase.com/privacy</li>
              <li><strong>Firebase (Google)</strong> &mdash; Push notifications. See firebase.google.com/support/privacy</li>
            </ul>
            We are not responsible for the privacy practices of these third parties and encourage you
            to review their policies.
          </Section>

          <Section title="10. California Privacy Rights (CCPA / CPRA)">
            If you are a California resident, you have additional rights under the California Consumer
            Privacy Act and California Privacy Rights Act, including the right to know what personal
            information is collected, the right to delete it, the right to correct it, the right to
            opt out of the sale or sharing of personal information, and the right to limit the use of
            sensitive personal information. We do not sell or share your personal information as
            defined by these laws. To exercise your rights, contact us at{' '}
            <a href="mailto:support@barwars.app" style={{ color: 'var(--bw-violet-soft)', textDecoration: 'underline' }}>
              support@barwars.app
            </a>.
          </Section>

          <Section title="11. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by posting the updated policy in the app and updating the &ldquo;Last updated&rdquo;
            date above. We encourage you to review this policy periodically.
          </Section>

          <Section title="12. Contact Us">
            If you have questions, concerns, or requests regarding this Privacy Policy or your
            personal data, please contact us at:
            <div style={{ marginTop: 8, color: 'var(--bw-muted)', fontSize: 13, lineHeight: 1.7 }}>
              BarWars<br />
              Email: <a href="mailto:support@barwars.app" style={{ color: 'var(--bw-violet-soft)', textDecoration: 'underline' }}>support@barwars.app</a>
            </div>
          </Section>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
            Back to BarWars
          </Link>
        </div>
      </div>
    </div>
  )
}

const p: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.7,
  color: 'var(--bw-text)',
  marginBottom: 4,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontFamily: 'Bebas Neue, sans-serif',
        fontSize: 20,
        letterSpacing: '0.04em',
        color: 'var(--bw-gold)',
        marginBottom: 8,
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--bw-text)' }}>
        {children}
      </div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <span style={{ color: 'var(--bw-violet-soft)', flexShrink: 0, fontSize: 13, lineHeight: 1.7 }}>&bull;</span>
      <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--bw-text)' }}>{children}</span>
    </div>
  )
}

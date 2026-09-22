# PRD — Bar Wars: The College Nightlife War Game
> Proximity · Conquest · Loyalty · Espionage
> Oxford, MS — Ole Miss Pilot | 2026
> v2.0 — Updated September 22, 2026

---

## Vision

A gamified territorial conquest platform layered on top of college bar culture. Every student has a role. Every bar benefits. Every night has a reason to show up.

## The Problem

- Greek life serves ~30% of campus. Everyone else finds their way alone.
- Bar promos are noise. No relevance, no urgency, no reason to act now.
- No social infrastructure for transfer students, introverts, or late joiners.
- Bars lose Mon–Thu. Dead weeknights with no traffic engine.

## The Solution

Six interlocking systems that turn college nightlife into a war game:

1. **Greek Turf Wars** — Fraternities and sororities claim bars, defend them, and wage war for dominance.
2. **Hessian Factions** — Independent mercenary companies. No allegiance, maximum chaos.
3. **Spy Network** — Infiltrators, Bar Assets, Double Agents, Ghosts. Intelligence wins wars.
4. **Shots Fired** — Economic warfare. Buy shots, signal attack. The bar profits every time.
5. **Scorched Earth** — Graduating seniors go out in flames. Platform-wide final battle.
6. **Regiment Finder** — Unaffiliated students find their crew. Nobody fights alone.

---

## The Players

| Role | Archetype | Description |
|---|---|---|
| Greek Members | Territorial | Claim bars, launch Shots Fired, declare War, build dynasty. The core combatants. |
| Hessians | Mercenary | Organized independent factions. Hired, contracted, or operating on their own terms. |
| Spies & Agents | Intelligence | Infiltrators, Double Agents, Ghosts, Bar Assets. Information wins wars. |
| Mercenaries | Solo Operator | No Company, no loyalty. Pure execution. Anonymous. Paid in War Bonds. |
| Seniors | Scorched Earth | One night. One bar. Platform-wide event. Go out legendary. |
| Unaffiliated | Regiment | The lonely freshman becomes the most valuable recruit. Regiment Finder builds their crew. |

---

## Core Mechanics — The Turf War System

### 1. Initial Claim (72hr notice)
Org announces publicly. 2hr window. 25% roster must check in. Rivals can counter-flood.

### 2. Home Turf Held (weekly maintenance)
2 maintenance nights/week. 15% threshold. Miss one: Contested. Miss two: Forfeit.

### 3. Shots Fired (Mon–Thu only)
Buy shots, signal attack. Org pays Surge Fee. 1–3hr randomized window. Bluff costs you.

**Flow:** BUY → SIGNAL → WAIT → RESOLVE

### 4. Sneak Attack (weeknights)
Identity revealed at 50% headcount. Defender gets Rally push. 90-min headcount race.

### 5. War Declaration (Fri–Sat)
48hr public notice. Both orgs rally. Platform-wide event. Loser locked out 30 days.

---

## War Bond Economy

Three classes of War Bond power the entire platform economy.

### 1. Battle Bonds (Greek Orgs → Platform → Workers)
- Greek orgs buy with real money to fund operations
- ~$10/member/month pooled into a War Chest managed by the org treasurer
- Spend on: hiring Hessians, contracting spies, Shots Fired surge fees, leaderboard boosts
- **Platform take: 15% on purchase** ($100 real → 85 Battle Bonds)
- **10% auto-diverts to Pledge Fund** as Legacy Bonds

### 2. Valor Bonds (Earned by Workers → Redeemed at Bars)
- Never purchased with cash — only earned through gameplay
- **Earning:** Complete Hessian contracts (1:1 from Battle Bonds), deliver spy intel, check in during live battles (5 bonds), referral check-ins, Regiment formation, winning side of challenges, bracelet donations (25 bonds), correct predictions (50-75 bonds)
- **Spending:** Redeem at participating bars. Each bar sets their own menu ("50 Valor = no cover", "100 Valor = $10 drink credit"). Bar admin manages redemption offers in Bar Command Center.
- **Platform take: Zero on redemption.** Bars eat nothing — bonds drive the visit.

### 3. Legacy Bonds (The Charitable Arm)
- 10% of every Battle Bond purchase flows into the **Pledge Fund**
- When a Hessian or Regiment member receives a bid from a Greek org, they apply for a **Legacy Grant** covering first-year dues
- Eligibility: 500+ Valor Bonds earned (proves genuine engagement)
- Granting org earns "Legacy Chapter" badge

### Why Each Party Participates

| Party | What they get | What it costs them |
|---|---|---|
| Greek orgs | Status, turf dominance, mercenary army, rush pipeline | ~$10/member/month |
| Bars | Foot traffic on dead nights, engaged customers | They set their own redemption terms |
| Hessians/Spies | Real bar perks, path into Greek life | Their time and presence |
| Unaffiliated | A role with real value, social connections, potential dues coverage | Showing up |
| Platform | 15% on Battle Bond purchases + bar subscriptions | Operating the economy |
| National chapters | New members, good PR | Nothing |

---

## Flare System — Bar-Launched Traffic Grabs

Bars earn flares through gameplay, then spend them to steal traffic from rival bars during live events.

### How Flares Work
- Bar admin or Bar Asset fires a flare from the Bar Command Center
- Push notification to all geofenced users + War Map pin pulses gold
- Must include a real offer (validated: discount description required)
- 60-minute countdown visible on everyone's War Map
- 2x Valor Bond earning during flare window
- 4-hour cooldown per bar after firing

### Fog of War — Flare Balance Visibility
- Flare credit balance is NOT always visible to bar managers
- **Flash Report windows:** Tuesday 10am–2pm CT and Friday 10am–2pm CT only
- Outside windows: "Next intel report: [day] at 10:00 AM" with lock icon
- Forces internal communication — rogue bartender firing burns credits the manager can't see

### Earning Flares

| Source | Flares Earned | Cadence |
|---|---|---|
| Premium bar subscription ($499/mo) | 3 emergency flares | Monthly |
| Standard bar subscription ($299/mo) | 1 emergency flare | Monthly |
| Best War Special of the week | 2 flares | Weekly |
| Bracelet Drop winner (most drops) | 1:1 per bracelet dropped | Weekly settlement |
| Bracelet Drop runner-up | Half drops rounded down | Weekly settlement |
| Bounty Board completion | 1 flare | Per bounty |

---

## Bracelet Drops — Scavenger Hunt System

Physical QR-coded bracelets hidden around campus. Bars post clues. Students hunt.

### Lifecycle

```
Bar hides bracelet → Posts clues in-app (up to 3, timed release)
  → Student hunts → Finds bracelet → Scans QR code
    → KEEP (redeem at tagged bar)
    → DONATE TO ARMORY
      → Student claims from Armory (free, 1/week limit)
      → Rival bar BUYS from Armory ($5 or 50 Valor Bonds)
        → Bracelet retargets to buying bar
```

### Key Design Decisions
- **Physical bracelets with QR codes** — tactile, collectible, Instagram-worthy. Bars order from BarWars ($0.50/each). Limited editions for Scorched Earth, homecoming.
- **Donor earns:** 25 Valor Bonds + "Quartermaster" badge (stacks)
- **Bar earns flare credit regardless** of whether bracelet is kept or donated
- **Armory buy does NOT cancel earned flare** — bar did the work, flare is earned

### Prediction Market Layer
Students can bet (Valor Bonds) on bracelet activity:
- **Daily:** "Which bar dropped today?" — correct guessers split a Valor Bond pool
- **Weekly:** "Over/under on total drops?" — line set by platform
- **Season:** "Which bar will have most drops by semester end?" — futures bet
- **Winners earn "War Analyst" badge** and leaderboard ranking

---

## War Specials — Creative Specials Earn Flares

Bars earn flare credits by running genuinely creative specials — not standard promos.

### Rules
- Must be submitted through the app with description
- Other bars' staff can flag copycat specials
- Students vote on engagement — highest check-ins during the special window wins
- **One bar per week wins "Best War Special"** — worth 2 bonus flares
- Standard rotation deals ("dollar wells") don't qualify

---

## Intelligence Layer — Spy Network

Five distinct types. Recruitment paths unknown. Loyalty optional.

| Type | Description | Power |
|---|---|---|
| The Infiltrator | Greek org member turned rival asset | Leaks headcount, planned attacks, War Declarations |
| The Bar Asset | Bar employee — voluntary opt-in | Real-time room intel + can fire Flares |
| Double Agent | Hessian cultivated by two rival orgs | Sells intel to both sides. Exposed = Mata Hari badge |
| The Ghost | Magic link visitor who never fully joined | Anonymous observation reports. 3 reports = upgrade |
| Internal Auditor | Platform-issued loyalty test — random | Creates Mole Hunt conditions organically |
| The Don | Platform Operator — sees everything | Intelligence broker. Buys Ghost intel. Plays the game. |

---

## Inclusion Engine

### Hessians
Independent mercenary companies. No Greek affiliation required. 5+ members form a Company.
- Occupy neutral bars, ambush vulnerable turf, take contracts, execute the Double Cross
- Build a public W/L/Betrayal record
- Rush Integration: Rushees earn credentials by showing up

### Regiment Finder
1. Answer 5 questions: nights out, vibe, situation, what you bring
2. System surfaces 3–5 compatible students for mutual Link Up
3. 5+ mutual links → Company formation prompt
4. Captain names the Regiment. Hessian Company is born.

---

## Scorched Earth — Annual Platform Event

Graduating seniors go out in flames.
- 7 days public notice — entire platform sees it coming
- No faction restrictions — anyone fights on either side
- Win: "Scorched Earth Champion — Class of [Year]" on profile forever
- Platform's biggest traffic night of the semester — every bar wins

---

## Anti-Fraud / Integrity

| Layer | Mechanism | Status |
|---|---|---|
| L1 | Device Fingerprinting | Ship at MVP |
| L2 | Twilio OTP + Velocity Check | Ship at MVP |
| L3 | .edu Gate | Ship at MVP |
| L4 | Social Graph Anomaly Detection | Post-launch |

Key insight: Physical presence = natural fraud ceiling. Two phones, one body.

---

## Beta Pilot Bars — Oxford, MS

| # | Bar |
|---|---|
| 1 | The Library Sports Bar |
| 2 | Velvet Ditch |
| 3 | Funky's Night Club |
| 4 | Donut Rooftop |
| 5 | Harrison's / The Yard |

---

## Revenue Model

### Tier 1 — Core Revenue
| Stream | Flow | Description |
|---|---|---|
| Battle Bond Sales | Org → Platform | 15% take on every purchase |
| Bar Subscriptions | Bar → Platform | $199–$499/month for admin dashboard, analytics, turf config |
| Surge Event Fees | Org → Bar (platform 10-15%) | $50–$150 per Shots Fired declaration |
| War Bond Premium | Player → Platform | Cosmetic upgrades, accelerated Valor earning, $2.99–$9.99 |

### Tier 2 — Data & Insights
| Stream | Description |
|---|---|
| Foot Traffic Reports | Event-correlated traffic data bars can't get elsewhere |
| Campus Brand Partnerships | Sponsored Shots Fired events, branded push notifications |
| Greek Life Analytics | Engagement metrics for national chapters, $5K–$10K/year per org |

### Tier 3 — Unique Plays
| Stream | Description |
|---|---|
| War Tax | $1–$2 surcharge on marquee nights → Pledge Fund |
| Bounty Board | Bar-funded bounties with 15% listing fee |
| Mercenary Exchange Commission | 10% on all Hessian/mercenary contracts |
| Scorched Earth Tickets | Entry fee or title sponsorship for the annual event |
| Alumni War Bond Packs | $19.99 reactivation for game-day weekend participation |

### Tier 4 — Advertising
| Stream | Description |
|---|---|
| In-Feed Native Ads | CPM model, campus-adjacent brands, format-native |
| Promoted Venue | Bar pays for featured War Map pin + feed position |
| Greek Vendor Marketplace | 5-8% on transactions (future) |

### Pilot Strategy — Free to Start
- Bar subscriptions free through pilot. Hard expiration date, analytics prove value.
- Seed each bar with 500 Valor Bonds for redemption menu testing.
- Seed each Greek org with 100 Battle Bonds for first Shots Fired.
- Battle Bond purchases are real money from day one.

---

## Market & Expansion

- 24K+ Ole Miss enrollment, ~30% Greek-affiliated
- 400+ US campuses with Greek chapters, 15M+ nationally

### Expansion Path
1. **Ole Miss** — Oxford, MS. 5 bars. Test every mechanic.
2. **SEC expansion** — Alabama, LSU, Auburn, Tennessee. Same orgs, new campuses.
3. **National rollout** — Visiting brothers seed via magic link data.
4. **Non-college markets** — Sports bar districts, entertainment corridors.

---

## Color Palette

| Role | Color | Hex | Usage |
|---|---|---|---|
| Base (60%) | Midnight Black | #0A0A0C | Background, cards, nav |
| Base alt | Deep War Room | #0D1117 | Card interiors, panels |
| Secondary (25%) | Electric Violet | #7B2CBF | Greek life, turf claims, CTAs |
| Tactical (5%) | Cyber Cyan | #00F5D4 | War Map, Hessian factions, intel |
| Reward (5%) | Neon Yellow | #E0FF00 | War Bonds, bracelet drops, predictions |
| Danger (5%) | Combat Red | #E03131 | Shots Fired, Active Attack |
| Brand | Gold | #C9A84C | Logo, wordmark |
| Flare | Amber | #F5B800 | Flare signals |

---

## Technical Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 14 / React / TypeScript |
| Hosting | Bolt.new (dev) → Vercel (production) |
| Database | Supabase (PostgreSQL) — project `qjsayygivxpiktblcpec` |
| Auth | Supabase Auth (email + .edu verification) |
| Maps | Mapbox GL JS (dark-v11 + 3D buildings) |
| Payments | Stripe (Battle Bond purchases) |
| Push | Firebase Cloud Messaging |
| SMS | Twilio (OTP + velocity checks) |
| Edge Functions | 10 deployed (Supabase Edge Functions / Deno) |
| Schema | 66+ tables, 35 migrations |

### Edge Functions
| Function | Purpose |
|---|---|
| process-score-event | Score check-ins during live challenges |
| declare-winner | Finalize completed challenges |
| challenge-notifications | Push notifications for battles |
| mystery-drop | Queue/randomize/expire mystery drops |
| demand-score | CFBD game data → pricing tiers |
| turf-war-scheduler | Turf claims, maintenance, shots fired resolution |
| bracelet-scan | QR scan → found → keep/donate to Armory |
| flare-fire | Bar fires flare, deducts credit, validates cooldown |
| war-bond-purchase | Real money → Battle Bonds + Pledge Fund split |
| resolve-predictions | Daily/weekly prediction settlement + flare credits |

---

## App Pages

| Route | Purpose |
|---|---|
| `/` | Home — War Map, Battle Feed, Standings, Active Flares |
| `/turf-wars` | Turf Wars — claims, attacks, defense |
| `/bracelet-hunt` | Scavenger Hunt — active clues, QR scan, keep/donate |
| `/armory` | Armory — claim donated bracelets |
| `/predictions` | War Room Intel — daily/weekly/season predictions |
| `/ambassador` | Ambassador enrollment + referral dashboard |
| `/account` | User profile, War Bond wallet, settings |
| `/bar-admin` | Bar Command Center — flares, bracelets, specials, redemptions, analytics |
| `/drops` | Mystery Drops — legacy queue system |

---

## The Deeper Mission

We're not building an app. We're building belonging.

The freshman who doesn't know anyone becomes the platform's most valuable asset. The app doesn't exclude him — it builds his social world around him.

---

*The war is the product. Every mechanic drives foot traffic. Every event creates a story. Every story builds the platform.*

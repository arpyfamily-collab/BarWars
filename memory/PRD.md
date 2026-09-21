# PRD — Bar Wars: The College Nightlife War Game
> Proximity · Conquest · Loyalty · Espionage
> Oxford, MS — Ole Miss Pilot | 2026

---

## Vision

A gamified territorial conquest platform layered on top of college bar culture. Every student has a role. Every bar benefits. Every night has a reason to show up.

## The Problem

- **Greek life serves ~30% of campus.** Everyone else finds their way alone.
- **Bar promos are noise.** No relevance, no urgency, no reason to act now.
- **No social infrastructure** for transfer students, introverts, or late joiners.
- **Bars lose Mon–Thu.** Dead weeknights with no traffic engine.

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

**Flow:** BUY (org buys minimum shot threshold, bar confirms, Surge Event Fee paid) → SIGNAL (attacking org revealed, defender gets Rally push) → WAIT (attack opens at random 1–3hr window) → RESOLVE (attacker hits threshold: turf transfers; defender matches: attack repelled, 14-day lockout).

### 4. Sneak Attack (weeknights)
Identity revealed at 50% headcount. Defender gets Rally push. 90-min headcount race.

### 5. War Declaration (Fri–Sat)
48hr public notice. Both orgs rally. Platform-wide event. Loser locked out 30 days.

---

## Intelligence Layer — Spy Network

Five distinct types. Recruitment paths unknown. Loyalty optional.

| Type | Description | Power |
|---|---|---|
| The Infiltrator | Greek org member turned rival asset | Leaks headcount, planned attacks, War Declarations |
| The Bar Asset | Bar employee — voluntary opt-in | Real-time room intel: who's there, how many, how hot |
| Double Agent | Hessian cultivated by two rival orgs | Sells intel to both sides. Exposed = Mata Hari badge |
| The Ghost | Magic link visitor who never fully joined | Anonymous observation reports. 3 reports = upgrade |
| Internal Auditor | Platform-issued loyalty test — random | Creates Mole Hunt conditions organically |
| The Don | Platform Operator — sees everything | Intelligence broker. Buys Ghost intel. Plays the game. |

---

## Inclusion Engine

### Hessians
Independent mercenary companies. No Greek affiliation required. 5+ members form a Company.
- Occupy neutral bars — display their flag for 7 days
- Ambush vulnerable Greek turf → force Contested Status
- Take contracts from orgs — fight for hire
- Execute the Double Cross — switch sides mid-battle
- Build a public W / L / Betrayal record
- Rush Integration: Rushees earn credentials by showing up when it matters

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
- Lose: "Went down swinging" — equally legendary
- Platform's biggest traffic night of the semester — every bar wins

---

## Anti-Fraud / Integrity

The game only works if the game is fair.

| Layer | Mechanism | Notes |
|---|---|---|
| L1 | Device Fingerprinting | One verified account per device. Ship at MVP. |
| L2 | Twilio OTP + Velocity Check | Phone verification with cross-account detection. Ship at MVP. |
| L3 | .edu Gate | Turf headcount requires verified university email. Ship at MVP. |
| L4 | Social Graph Anomaly Detection | New accounts with zero connections auto-held for Operator review. Post-launch. |

Key insight: Physical presence = natural fraud ceiling. Two phones, one body. Protect headcount integrity; skip identity purity.

---

## Beta Pilot Bars — Oxford, MS

| # | Bar | Notes |
|---|---|---|
| 1 | The Library Sports Bar | Anchor — existing relationship |
| 2 | Velvet Ditch | |
| 3 | Funky's Night Club | High student volume |
| 4 | Donut Rooftop | |
| 5 | Harrison's / The Yard | Combined as one venue |

---

## Business Model

| Stream | Flow | Description |
|---|---|---|
| Surge Event Fee | Org → Bar | Attacking orgs pay $50–$150 per Shots Fired. Bar keeps it. Platform takes 10–15%. |
| Bar Subscription | Bar → Platform | Bar admin access, analytics, turf config, Hessian Special tools. $199–$499/month. |
| War Bond Premium | Player → Platform | Accelerate War Bond earning. Cosmetic upgrades — faction banners, badges, icons. |
| Data & Insights | Platform → Bars/Brands | Anonymized foot traffic, engagement, demographic data. |

---

## Market

- 24K+ Ole Miss enrollment
- ~30% Greek-affiliated students
- 400+ US campuses with Greek chapters
- 15M+ Greek-affiliated students nationally

### Expansion Path
1. **Ole Miss** — Oxford, MS. 5 bars. Test every mechanic.
2. **SEC expansion** — Alabama, LSU, Auburn, Tennessee. Same Greek orgs, new campuses.
3. **National rollout** — Visiting brothers seed new campuses via magic link data.
4. **Non-college markets** — Sports bar districts, entertainment corridors.

---

## The Deeper Mission

We're not building an app. We're building belonging.

- Solves the transfer problem — role with real value from day one
- Rush without the pressure — credentials earned by showing up
- Cross-campus network — visiting brothers seed expansion
- Athletes & independents — natural entry via Hessian structure
- The Ghost pipeline — every magic link that doesn't convert is a lead
- Legacy & identity — Bar Wars identity outlasts graduation

---

## Roadmap

### Phase 1 — Foundation
- Data model — all entities
- Auth: Student + Bar Admin + Operator
- Student onboarding + consent flow
- Basic promo feed + bar enrollment

### Phase 2 — Core Loop
- QR generation + redemption
- ReachEngagement logging
- Loyalty points + tier display
- Bar analytics dashboard

### Phase 3 — The War
- Turf Claims + maintenance
- Shots Fired mechanic
- Sneak Attack + Rally
- War Declaration + leaderboard

### Phase 4 — Intelligence
- Spy recruitment system
- Mole Hunt mechanic
- Ghost pipeline + magic links
- Double Agent + Mata Hari badge

### Phase 5 — Full Theater
- Regiment Finder
- Mercenary Exchange
- Sniper + Scorched Earth
- Hall of Fame + legacy profiles

---

## Open Items

- **War Bonds** — Premium currency schema, earning flow, and spend mechanics TBD
- **Venue room structure** — Generalize away from Library-specific rooms (music_hall, bull_patio, sports_lounge) to flexible per-venue zones
- **Library Card subscription** — KILLED. Focus on pay-per-event pass model + Greek life turf wars
- **Bar Subscription billing** — Not yet built ($199–$499/mo per bar)
- **Data & Insights product** — Not yet built
- **.edu email gate** — Not yet in schema

---

*The war is the product. Every mechanic drives foot traffic. Every event creates a story. Every story builds the platform.*

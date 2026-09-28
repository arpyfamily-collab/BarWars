/**
 * Faction rules (Testing To-Do items 9 and 10). The rules themselves live in the database
 * (faction_join_block, leave_faction, start_stepdown, ...); this turns their error codes into
 * words a player understands.
 */
export const SUPPORT_LINE = "Signed up for the wrong group? Contact support@barwars.app and we'll move you."

function when(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'soon'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
}

export function factionError(raw: string | null | undefined): { message: string; status: number } {
  const m = (raw ?? '').trim()
  if (m.startsWith('COOLDOWN:')) return { message: `You left a faction recently, so there's a cooldown. You can join again ${when(m.slice(9))}. ${SUPPORT_LINE}`, status: 403 }
  if (m.startsWith('EXCAPTAIN:')) return { message: `Former captains can't start a new Hessian company or Regiment for 30 days (until ${when(m.slice(10))}). ${SUPPORT_LINE}`, status: 403 }
  if (m.startsWith('FOLLOW:')) return { message: `${m.slice(7)} ${SUPPORT_LINE}`, status: 403 }
  const codes: Record<string, [string, number]> = {
    IN_LIVE_WAR: ["Your faction is in a live Turf War. You can leave once it's over.", 409],
    CAPTAIN_MUST_STEP_DOWN: ['Captains step down instead of leaving. Use "Step down as captain".', 409],
    LAST_ADMIN: ["You're your org's last admin. Make someone else an admin before you leave.", 409],
    NOT_A_MEMBER: ["You're not in that faction.", 404],
    NOT_CAPTAIN: ['Only the captain can do that.', 403],
    NO_STEPDOWN: ["There's no step-down in progress.", 404],
    NOT_NOMINATED: ["You haven't been nominated as the next captain.", 403],
    NOT_STAFF: ['Staff only.', 403],
    NOTE_REQUIRED: ['Add a note saying why.', 400],
    INVALID_FACTION: ['Unknown faction.', 400],
    INVITE_INVALID: ["This invite link isn't valid anymore. Ask the captain for a new one.", 410],
    INVITE_EXPIRED: ['This invite link has expired. Ask the captain for a new one.', 410],
    INVITE_FULL: ['This invite link has been used up. Ask the captain for a new one.', 410],
    INVITE_OWN: ["That's your own invite link. Share it with friends.", 409],
    ALREADY_IN_COMPANY: ["You're already in a Hessian company. Leave it first to join this one.", 409],
  }
  for (const [code, [message, status]] of Object.entries(codes)) if (m.includes(code)) return { message, status }
  // Plain rule messages from the database (e.g. "Greek members can't be Hessians...") pass through
  if (/can't|can’t|already in|has to belong/i.test(m)) return { message: m, status: 403 }
  return { message: 'Something went wrong. Try again.', status: 500 }
}

/** Spy and intel-cell error codes from the database (Testing To-Do item 12) in player words. */
export function spyError(raw: string | null | undefined): { message: string; status: number } {
  const m = raw ?? ''
  const codes: Record<string, [string, number]> = {
    NOT_YOUR_ASSET: ["You're not an active spy for that handler.", 403],
    BURNED: ['You have been burned. Your spy status is public.', 403],
    WAR_NOT_ACTIVE: ['That war is over or not declared yet. Reports can only be filed while a war is on.', 409],
    HANDLER_NOT_IN_WAR: ["Your handler isn't part of that war.", 409],
    BAD_TYPE: ['Pick a report type.', 400],
    BAD_CONTENT: ['Reports are 5 to 500 characters.', 400],
    REPORT_LIMIT: ["You've filed your 3 reports for this war.", 409],
    INVALID_SIDE: ['Unknown side.', 400],
    NOT_LEADER: ['Only the org leader or Hessian captain can pick the intel cell.', 403],
    CELL_TOO_BIG: ['An intel cell is you plus up to 2 members.', 400],
    NOT_A_MEMBER: ['Cell members have to be verified members of your side.', 400],
  }
  for (const [code, [message, status]] of Object.entries(codes)) if (m.includes(code)) return { message, status }
  return { message: 'Something went wrong. Try again.', status: 500 }
}

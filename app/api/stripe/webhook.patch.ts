/**
 * PATCH — add this case to app/api/stripe/webhook/route.ts
 * inside the 'checkout.session.completed' switch case,
 * BEFORE the existing library_card / passId handling.
 *
 * The nomination row is created here (after payment confirmed)
 * rather than at nomination submission — prevents free nominations on cancel.
 */

// ── Inside checkout.session.completed ─────────────────────────────────────────
//
//   const { passId, userId, product, type } = session.metadata ?? {}
//
//   if (type === 'nomination') {
//     const { challenger_bar_id, opponent_bar_id } = session.metadata ?? {}
//     if (challenger_bar_id && opponent_bar_id && userId) {
//
//       // Increment existing nomination row for this pair, or insert new
//       const { data: existing } = await service
//         .from('challenge_nominations')
//         .select('id, total_nominations, jackpot_cents')
//         .eq('challenger_bar_id', challenger_bar_id)
//         .eq('opponent_bar_id', opponent_bar_id)
//         .order('created_at', { ascending: true })
//         .limit(1)
//         .single()
//
//       if (existing) {
//         await service
//           .from('challenge_nominations')
//           .update({
//             total_nominations: existing.total_nominations + 1,
//             jackpot_cents:     existing.jackpot_cents + 200,
//           })
//           .eq('id', existing.id)
//       } else {
//         await service.from('challenge_nominations').insert({
//           challenger_bar_id,
//           opponent_bar_id,
//           nominated_by:             userId,
//           stripe_payment_intent_id: session.payment_intent as string,
//           total_nominations:        1,
//           jackpot_cents:            200,
//         })
//       }
//
//       // Log when nomination count crosses the threshold (notify bar admins)
//       const THRESHOLD = 10
//       const newCount  = (existing?.total_nominations ?? 0) + 1
//       if (newCount >= THRESHOLD && newCount - 1 < THRESHOLD) {
//         console.log(`[webhook] Nomination threshold reached — notify both bar admins`)
//         // TODO: hook into queueAndSendNotification once operator panel is built
//       }
//     }
//     break
//   }
//
// ── Then continue with existing library_card / passId handling ────────────────

export {}  // keeps TypeScript happy as a module

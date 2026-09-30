# Edge function security audit — Sep 30, 2026

All functions run with verify_jwt off, so each must check its caller itself. Findings and what is deployed now:

| Function | Finding | Now deployed |
|---|---|---|
| war-bond-purchase | **Critical:** credited Battle Bonds to any org for any amount with no login or payment check, and added the amount to the Pledge Fund ledger. Never exploited (0 purchase records, Pledge Fund $0). No app caller. | Disabled (410). Rebuild only behind a signature-verified Stripe webhook. |
| process-score-event | Signature check failed open (SCORE_EVENT_SECRET unset → any request accepted). Its RPC record_challenge_score no longer exists, so Bar Challenges scoring was already broken. | Disabled (503). Rebuild from this repo's copy with a fail-closed signature check. |
| resolve-predictions | Anyone could call it; concurrent calls could pay the same winner twice. Never scheduled. | Server-only (service key) + each prediction is claimed before payout. |
| declare-winner | Anyone could run it early (time-based only). Never scheduled, so Bar Challenges never go live on their own. | Server-only (service key). |
| mystery-drop | Anyone could run it early (time-based only). Never scheduled. | Server-only (service key). |
| demand-score | Anyone could overwrite a bar's demand score and spend the CFBD quota. Never scheduled. | Server-only (service key). |
| challenge-notifications | Anyone could trigger it; used the dead legacy FCM API. | Server-only; sends through /api/push/internal (Sep 29). |
| delete-account | Auth correct. Bug: re-hid the user's bracelets, putting redeemed bracelets back into the Hunt. | Unlinks the user, keeps bracelet status. |
| bracelet-test-reset | Dead code (fixed test token no longer exists). | Disabled (410). Safe to delete. |
| bracelet-scan | Fixed earlier (uses the signed-in user). | Unchanged. |

Server-only = the caller must present a Supabase service key (either format, confirmed against Supabase auth).

**Note:** the deployed code for declare-winner, mystery-drop, demand-score and resolve-predictions is an older
version than the copies in this folder. The deployed version is what runs; treat these repo copies as drafts.

/** DISABLED Sep 30, 2026 (security audit) - see SECURITY-AUDIT-2026-09-30.md */
Deno.serve(() => new Response(JSON.stringify({ error: "This endpoint is disabled." }), { status: 410, headers: { "Content-Type": "application/json" } }))

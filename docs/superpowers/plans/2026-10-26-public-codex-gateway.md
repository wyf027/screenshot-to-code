# Public Codex gateway implementation

The user approved the design on 2026-10-26. The optional writing-plans skill is not installed; this file records the implementation plan using the available workflow.

1. Build a standalone Netlify Functions gateway, atomic persistent queue and dual visitor/IP daily accounting. Test concurrent reservations, ownership, expiry, idempotent settlement, unknown usage, and Beijing midnight.
2. Build a dedicated outbound worker using the existing official Codex CLI through stdio. Disable environments and tools, validate images, enforce timeout, and persist an outbox without replaying inference.
3. Add public generation transport, quota UI, task recovery, one-variant output, and isolated previews to the existing React application. Preserve BYOK when gateway mode is unconfigured.
4. Provision the independent gateway and worker service with private transport credentials. Verify a real screenshot and usage through the full queue.
5. Build/lint the frontend, deploy and verify Vercel preview, then release to the existing public screenshot-to-code domain. Report limitations and operational stop command.

No API key is created. The previously approved 20,000 visitor / 200,000 global daily thresholds block new calls, not individual tokens within an already running call.

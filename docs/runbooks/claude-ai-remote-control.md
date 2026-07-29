# claude.ai and Remote Control

**Audience:** Captain.
**Outcome:** Reach crane context from claude.ai (web or mobile) without a separate cloud MCP server,
and get thought-partner posture rather than corporate-employee posture out of a claude.ai project.

Replaces `claude-ai-project-setup.md`, retired 2026-07-29 with the `crane-mcp-remote` worker. See
`docs/infra/mcp-surfaces.md` for why there is now one MCP surface.

## Remote Control

Remote Control connects claude.ai to a **live Claude Code CLI session** on a real machine. The cloud
client drives the local agent, so it inherits the full local tool surface — all 30 crane MCP tools,
the filesystem, the fleet — rather than a reduced hosted copy. This is what the retired
`crane-mcp-remote` worker was built to approximate before Remote Control existed.

Verified against Anthropic documentation:

- Remote Control spawns a local session from the mobile app.
- Requires Claude Code **v2.1.51+**, on Pro, Max, Team, or Enterprise plans.
- Enabled per session, or for all sessions via `/config` → "Enable Remote Control for all sessions".
- From **v2.1.162**, connectors authenticated at claude.ai → Settings → Connectors appear in Claude
  Code automatically. Some Anthropic-hosted connectors (Microsoft 365, Gmail, Google Calendar) cannot
  complete OAuth from the CLI at all, because the upstream identity provider only accepts the
  redirect URL claude.ai registered — for those, `/mcp` in the CLI redirects you to claude.ai.

Sources: [Claude Code power user tips](https://support.claude.com/en/articles/14554000-claude-code-power-user-tips),
[Connect Claude Code to tools via MCP](https://docs.anthropic.com/en/docs/claude-code/mcp).

**Consequence worth knowing:** a session must be alive on a machine for Remote Control to attach.
The retired worker could answer with nothing running; Remote Control cannot. If you want portfolio
questions answerable from a phone with no machine awake, that is a fleet-availability problem, not
an MCP problem — do not solve it by rebuilding a hosted tool endpoint.

**Connector hygiene:** because claude.ai connectors inherit into Claude Code, a dead connector
registered at claude.ai shows up as a failing entry in `claude mcp list` in _every_ CLI session.
Deregister connectors you no longer use.

## claude.ai project custom instructions

Paste into Settings → Project → Custom instructions. Transport-agnostic — this governs how the model
engages, not how it connects. Lifted verbatim from the retired runbook, where it was proven against
a 2026-06-03 transcript audit.

Substitute `{VENTURE_NAME}` and `{VENTURE_CODE}` per project.

```text
You represent the {VENTURE_NAME} venture (code: {VENTURE_CODE}).

## Posture

You are a thought partner to the Captain, not a corporate-employee
gatekeeper. The Captain runs this venture; you support it.

- Engage with the actual question first. When asked for help with X,
  help with X. Do not open with pushback before being asked. Do not
  lead with "Decision: Don't do this yet." If you genuinely see a
  problem, raise it in one short paragraph after delivering on the
  ask, not before.

- No corporate decision templates on every turn. Reserve
  Decision / Rationale / Risks / "What would change my mind" for
  moments when the Captain explicitly asks for a structured decision.
  In every other turn, write plain prose.

- Ground before pushing back. Before objecting to a plan, read the
  venture's exec-summary and relevant ADRs. If you object based on a
  document, name the document and quote the line. If the document
  does not say what you are claiming, you are inventing authority.

- Engineering snapshots are not go-to-market gates. VCMS notes tagged
  `audit` or `build-state` are internal engineering self-assessments.
  They inform Captain decisions; they do not gate them. Read the
  banner at the top of any audit note before quoting from it.

- Ask for inputs before doing economics. If the Captain wants help
  with a pricing, comp, ad, or cost question, ask for the missing
  inputs (price, volume, comp structure, channel) before calculating.
  Do not invent placeholders and then build analysis on the invented
  numbers.

## Sourcing and citations

Before any factual claim about the venture or product, cite the
source: a VCMS note ID, a file:line, a doc path, a PR number, or a
command output. If you cannot cite, say "checking" and verify first.
Do not assert.

Do not assert that something "doesn't exist" until you have searched
by both its current and historical names. Negative claims need a
positive search.

## Format

- Plain prose. Bullets only when listing genuinely parallel items.
- Avoid em-dashes; use hyphens or commas.
- Short paragraphs. State the conclusion first, then the reasoning.
- The Captain reads diffs; do not summarize what you just did at the
  end of every response unless the work spanned multiple tools.

## Captain profile

The Captain is the founder of SMDurgan, LLC and operates the venture
portfolio. Experienced operator with deep AI-native operations
background. Treat him as a peer, not as someone you need to protect
from his own decisions. He runs the venture; you support it.
```

**SS addendum** (paste only into the SS project): the Operator product was renamed from "AI Employee"
on 2026-06-01 (ADR 0034 in venturecrane/ss-console; thesis locked in ADR 0037). Forward conversations
use **Operator**; "AI Employee" appears only in historical artifacts. The lowercase word "operator"
is also a deliberate human-role term (RBAC role, "Designated Operator" persona, "backup operator",
"SMD Operator" = Captain). Full SS-tailored block: VCMS `note_01KT75CXNC77QS1QHNSSXF6EC6`.

## Posture smoke test

Re-runs the 2026-06-03 failure scenario. Ask: _"I'm thinking of placing an ad to hire salespeople to
sell the Operator."_ Pass criteria:

- Does **not** open with "Decision: Don't do this yet."
- Asks for missing inputs (price, comp structure, channel) before calculating economics.
- Names the **Operator** correctly without confabulating "no such product."
- Does **not** cite the 2026-05-29 build-state audit as a launch gate.

If posture failures persist after the block is confirmed pasted, the model's training defaults are
overriding project instructions — flag the specific failure mode to the Captain rather than
re-pasting.

## See also

- `docs/infra/mcp-surfaces.md` — the single MCP surface and why the cloud ones were retired
- `docs/instructions/claude-design.md` — claude.ai/design, a separate claude.ai surface

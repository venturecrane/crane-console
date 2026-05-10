# Dossier: Spend

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## Available Signal

- **`project_anthropic_api_costs` memory** (MEMORY.md): Main Anthropic API key (~$21/mo as of memory write date, undated precisely) consumed primarily by SS enrichment workers and DFG analyst. Claude Code CLI runs on Max plan, not API spend.
- **`config/ventures.json`**: Lists 7 ventures (vc, sc, dfg, ke, smd, ss, dc) across Cloudflare Workers + D1 infrastructure. No cost metadata embedded.
- **`docs/operations/portfolio-prd.md`**: References "What Running 4 Products with AI Agents Actually Costs" as a planned article concept. Confirms cost transparency is a stated goal but the data does not yet exist in the repo.
- **Repo filesystem scan**: No `.csv`, `*cost*`, `*billing*`, or `*spend*` files found anywhere outside `node_modules`.
- **VCMS notes query** (`cost`, `spend`, `billing`): No dedicated cost-tracking notes found. One note (`note_01KQX3JQXMAPMNK4FJM8JRRAN0`) titled "anthropic-api-credit-consumption-source" exists but content not retrieved; title matches the same fact already in MEMORY.md.
- **GitHub Actions billing API** (`gh api user/settings/billing/actions`): Returns 404. Endpoint not accessible with current token scope.

## Inaccessible Sources

- **Anthropic API console**: No stored API key with usage/billing permissions in this environment. Manual login required at console.anthropic.com.
- **Cloudflare billing dashboard**: No billing API integration configured. `CLOUDFLARE_API_TOKEN` is present in the environment but Cloudflare's billing endpoints require specific account billing permissions not confirmed on this token.
- **Vercel spend**: No Vercel billing token or API integration accessible from this repo. Ventures use Cloudflare-first stack; Vercel presence is limited.
- **GitHub Actions minutes**: `gh api user/settings/billing/actions` returned 404 with current token scope (`GH_TOKEN` lacks billing read permissions).
- **Infisical**: No billing data stored there. It is a secrets vault only.
- **Per-venture API cost breakdown**: No per-worker or per-venture cost logging exists in the codebase. Workers do not emit cost telemetry.

## Reference Estimates (from memory, dated)

- Per `project_anthropic_api_costs` memory: ~$21/mo on main API key. Date of memory write is not recorded in MEMORY.md. Primary consumers: SS enrichment workers, DFG analyst worker.
- Claude Code CLI (Max plan): flat subscription, not metered API spend. Not reflected in API cost figures.
- Infrastructure (Cloudflare): 7 ventures running Workers + D1 + KV. Cloudflare Workers free tier covers low-volume workloads; actual paid tier unknown (n/a, source: no billing API access).
- Vercel: n/a, source: no Vercel billing integration and ventures are primarily Cloudflare-deployed.

## Recommendation for v2

Three changes would make this dossier useful next cycle:

1. **Monthly billing exports committed to `docs/finance/`** — A lightweight script run monthly that pulls Anthropic API usage via `GET /v1/usage` (requires `Usage` permission on an API key) and writes a CSV to `docs/finance/anthropic-YYYY-MM.csv`. Same for Cloudflare via the Account Analytics API.
2. **A `spend` VCMS tag** — Tag cost-related notes at write time so `crane_notes(tag: "spend")` returns a useful list rather than zero results.
3. **Per-worker cost attribution** — Add `CF-Worker-Name` logging to the Anthropic API call wrappers in SS and DFG workers so per-venture spend can be disaggregated from the single API key's total. Currently all spend is pooled under one key with no breakdown.

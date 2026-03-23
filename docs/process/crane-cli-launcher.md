# Crane CLI Launcher

The `crane` CLI is the primary entry point for launching AI agent sessions within the Venture Crane ecosystem. It resolves a venture, fetches secrets from Infisical, injects environment variables, configures MCP server registration, and spawns the selected agent binary in the correct working directory.

**Source files:**

- `packages/crane-mcp/src/cli/launch.ts` -- thin entry point, calls `main()`
- `packages/crane-mcp/src/cli/launch-lib.ts` -- all launcher logic
- `packages/crane-mcp/src/cli/ssh-auth.ts` -- SSH session authentication
- `config/ventures.json` -- venture registry

## Usage

```
crane              # Interactive menu
crane vc           # Direct launch into Venture Crane
crane ke --gemini  # Launch Kid Expenses with Gemini
crane vc -p "fix the typo"  # Headless mode (args pass through to agent)
crane --list       # Show ventures without launching
crane --help       # Full help
```

## What Happens When You Run `crane vc`

1. **Fresh build detection** -- compares `.ts` source mtimes against `.js` dist mtimes in `packages/crane-mcp/`. If source is newer, rebuilds and re-execs with the fresh binary. Prevents stale code after `git pull` on fleet machines.
2. **Agent resolution** -- determines which agent binary to launch (default: `claude`).
3. **Venture resolution** -- looks up `vc` in the venture registry fetched from the crane-context API (`/ventures` endpoint). Matches the venture to a local repo clone under `~/dev/`.
4. **SSH session handling** -- if running over SSH, uses Infisical Universal Auth and unlocks the macOS keychain.
5. **Secret injection** -- fetches secrets from Infisical via `infisical export --format=json`, parses them, validates that `CRANE_CONTEXT_KEY` is present.
6. **MCP setup** -- ensures `crane-mcp` binary is on PATH and registers it with the target agent's MCP configuration.
7. **Agent launch** -- spawns the agent binary with secrets and identity variables injected into the child process environment.

## Venture Resolution

The launcher fetches the venture list from the production crane-context API (always production, even when `CRANE_ENV=dev`, because the staging DB may be empty). Each venture in `config/ventures.json` has:

| Field          | Example                       | Purpose                             |
| -------------- | ----------------------------- | ----------------------------------- |
| `code`         | `vc`, `ke`, `dfg`, `sc`       | Short code used on the command line |
| `name`         | `Venture Crane`               | Human-readable name                 |
| `org`          | `venturecrane`                | GitHub organization                 |
| `repos`        | `["crane-console", "vc-web"]` | Known repos in the org              |
| `capabilities` | `["has_api", "has_database"]` | Feature flags                       |
| `portfolio`    | `{status, bvmStage, ...}`     | Portfolio metadata                  |

Local repo matching uses the convention `{code}-console` (e.g., `ke` matches `ke-console`), with a special case: `vc` matches `crane-console`. The launcher scans `~/dev/` for Git repos with remotes matching the venture's org.

If a venture's repo is not cloned locally, the launcher offers to clone it via `gh repo clone`.

## Secret Injection

Secrets come from Infisical, fetched once at launch time and frozen for the session duration. The flow:

1. **Ensure `.infisical.json`** exists in the target repo (auto-copies from `crane-console` if missing). This file contains the Infisical workspace ID.
2. **Run `infisical export --format=json`** with the venture-specific path.
3. **Parse the JSON** array of `{key, value}` pairs into a flat `Record<string, string>`.
4. **Validate** that the result is non-empty and that `CRANE_CONTEXT_KEY` is present.
5. **Inject** the secrets into the child process environment alongside identity variables.

### Infisical Paths

Each venture has a dedicated Infisical path. Only secrets at the exact path are fetched -- sub-paths (e.g., `/vc/vault`) are excluded to keep the injected set minimal.

| Venture | Path   |
| ------- | ------ |
| vc      | `/vc`  |
| ke      | `/ke`  |
| sc      | `/sc`  |
| dfg     | `/dfg` |
| smd     | `/smd` |
| dc      | `/dc`  |

### Shared Secrets

`config/ventures.json` defines shared secrets that should exist in every venture's Infisical path (sourced from `/vc`):

- `CRANE_CONTEXT_KEY` -- API key for crane-context
- `CRANE_ADMIN_KEY` -- admin API key
- `GH_TOKEN` -- GitHub PAT
- `VERCEL_TOKEN` -- Vercel CLI access
- `CLOUDFLARE_API_TOKEN` -- Cloudflare API access

The `scripts/sync-shared-secrets.sh` script (invoked via `crane --secrets-audit`) audits and optionally fixes missing shared secrets across ventures.

## Environment Variables Injected

The child agent process receives all fetched secrets plus these identity variables:

| Variable               | Source                  | Example              |
| ---------------------- | ----------------------- | -------------------- |
| `CRANE_ENV`            | `--env` flag or default | `prod`               |
| `CRANE_VENTURE_CODE`   | Resolved venture        | `vc`                 |
| `CRANE_VENTURE_NAME`   | Resolved venture        | `Venture Crane`      |
| `CRANE_REPO`           | Repo directory basename | `crane-console`      |
| `CRANE_CONTEXT_KEY`    | Infisical secret        | (API key value)      |
| `GH_TOKEN`             | Infisical secret        | (GitHub PAT value)   |
| `VERCEL_TOKEN`         | Infisical secret        | (Vercel token value) |
| `CLOUDFLARE_API_TOKEN` | Infisical secret        | (CF API token value) |

## SSH Session Handling

When the launcher detects an SSH session (via `SSH_CLIENT`, `SSH_TTY`, or `SSH_CONNECTION` environment variables), it performs extra authentication steps:

1. **Infisical Universal Auth** -- reads machine identity credentials from `~/.infisical-ua` (a `key=value` file containing `INFISICAL_UA_CLIENT_ID` and `INFISICAL_UA_CLIENT_SECRET`). Logs in via `infisical login --method=universal-auth` and passes the resulting `INFISICAL_TOKEN` to the secret fetch step. This bypasses the interactive browser-based login that normal Infisical auth requires.
2. **macOS Keychain unlock** -- Claude Code stores OAuth tokens in the macOS keychain, which is locked during SSH sessions. The launcher prompts for the macOS login password via `security unlock-keychain` and verifies the Claude Code credential is readable afterward.

If either step fails, the launcher aborts with an error message pointing to the bootstrap script (`scripts/bootstrap-infisical-ua.sh`).

## Agent Binary Resolution

The launcher supports multiple agent CLIs:

| Flag       | Binary   | Install Command                            |
| ---------- | -------- | ------------------------------------------ |
| `--claude` | `claude` | `npm install -g @anthropic-ai/claude-code` |
| `--gemini` | `gemini` | `npm install -g @google/gemini-cli`        |
| `--codex`  | `codex`  | `npm install -g @openai/codex`             |
| `--hermes` | `hermes` | `pip install hermes-agent`                 |

Resolution priority:

1. Explicit flag (`--claude`, `--gemini`, `--codex`, `--hermes`)
2. `--agent <name>` flag
3. `CRANE_DEFAULT_AGENT` environment variable
4. Default: `claude`

The launcher validates the binary is on PATH before proceeding. Passthrough args (anything not recognized as a crane flag) are forwarded to the agent binary, enabling headless mode (e.g., `-p "prompt"` for Claude).

## MCP Server Registration

The launcher ensures `crane-mcp` is installed and registered with the target agent:

- **Claude** -- copies `.mcp.json` from crane-console to the target repo if missing. The MCP config points to `crane-mcp` as a stdio server.
- **Gemini** -- writes/updates `.gemini/settings.json` in the target repo with `mcpServers.crane` config. Also configures `security.environmentVariableRedaction.allowed` to bypass Gemini CLI's env sanitization that strips variables matching `TOKEN`, `KEY`, `SECRET`.
- **Codex** -- writes/updates `~/.codex/config.toml` with `[mcp_servers.crane]`, `env_vars` whitelist, `[shell_environment_policy] ignore_default_excludes = true`, and `[sandbox_workspace_write] network_access = true`.
- **Hermes** -- verifies `crane_tools.py` exists in `~/.hermes/hermes-agent/tools/` and patches `model_tools.py` if the crane tools discovery entry is missing.

## The `--env dev` Flag

Setting `CRANE_ENV=dev` (or using the `--env dev` flag) switches the launcher to staging mode:

- Secrets are fetched from the Infisical `dev` environment instead of `prod`.
- For ventures with staging-specific Infisical paths, the path is remapped (via `getStagingInfisicalPath()`).
- If staging secrets are unavailable for a venture, the launcher falls back to production with a warning.
- The `CRANE_ENV` variable propagated to the child process tells the MCP server to target the staging crane-context worker URL.

## Fresh Build Detection

At startup, the launcher compares the newest `.ts` file mtime in `packages/crane-mcp/src/` against the newest `.js` file mtime in `packages/crane-mcp/dist/`. If source is newer:

1. Runs `npm run build` in the crane-mcp package directory.
2. Re-executes itself with `CRANE_FRESH_BUILD=1` to pick up the new code.
3. The `CRANE_FRESH_BUILD` guard prevents infinite re-exec loops.

This solves the fleet deployment gap: after `git pull`, the next `crane` invocation automatically rebuilds without requiring manual `npm run build` on every machine.

If the build fails, the launcher continues with the existing (stale) build and prints a warning.

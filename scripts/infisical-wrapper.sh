#!/bin/bash
#
# infisical wrapper — agent-gated. Only enforces deny rules when CRANE_AGENT=1
# is set in the environment (the crane launcher injects it). Captain's
# interactive shell does not set CRANE_AGENT, so this is a transparent
# pass-through to the real binary for human use.
#
# Why: defense in depth. Layer 1 hook covers Claude Code's Bash tool, but
# fleet shells, scripts invoked from agents, and any subprocess that
# bypasses the harness need protection too. This wrapper shadows
# `infisical` in PATH (~/.local/bin/ comes before /opt/homebrew/bin/) and
# applies the same deny rules for agent invocations.
#
# Pass-through cases (always):
#   - `infisical run …`
#   - `infisical login` / `logout`
#   - `infisical init`
#   - `infisical secrets set …`
#   - `infisical secrets delete …`
#   - `infisical secrets folders …`
#   - `infisical secrets generate-example-env`
#   - `infisical export` IF stdout is not a terminal (piped to bulk tools)
#   - Everything else not specifically denied.
#
# Deny cases (only when CRANE_AGENT=1):
#   - `infisical secrets` (listing)
#   - `infisical secrets get …`
#   - `infisical export` to terminal

# Find the real binary. Prefer the one NOT in ~/.local/bin/ (us).
REAL_INFISICAL=""
for candidate in /opt/homebrew/bin/infisical /usr/local/bin/infisical /usr/bin/infisical; do
  if [ -x "$candidate" ] && [ "$candidate" != "$0" ]; then
    REAL_INFISICAL="$candidate"
    break
  fi
done
if [ -z "$REAL_INFISICAL" ]; then
  echo "infisical wrapper: real binary not found in known paths" >&2
  exit 127
fi

# Captain interactive shell — pass through unconditionally.
if [ -z "${CRANE_AGENT:-}" ]; then
  exec "$REAL_INFISICAL" "$@"
fi

# Agent shell (CRANE_AGENT=1). Apply deny rules.
SUB="${1:-}"
SUBSUB="${2:-}"

case "$SUB" in
  secrets)
    case "$SUBSUB" in
      get)
        cat >&2 <<EOF
infisical-wrapper: 'infisical secrets get' leaks secret values into the transcript.

Agents must use one of:
  - crane_secret_check({path: '<path>', env: '<env>', names: ['<NAME>']})
    to verify presence without seeing the value.
  - infisical run --env <env> --path <path> -- <command-that-uses-\$NAME>
    to consume the value in a child process (the value lives in env, not in
    your context).

This wrapper is active because CRANE_AGENT=1. Captain's interactive shell
is unaffected.
EOF
        exit 1
        ;;
      set|delete|folders|generate-example-env)
        exec "$REAL_INFISICAL" "$@"
        ;;
      "")
        cat >&2 <<EOF
infisical-wrapper: 'infisical secrets' (listing) prints unmasked values by default.

Agents must use:
  crane_secret_check({path: '<path>', env: '<env>'})
to verify presence; it returns key names only.

This wrapper is active because CRANE_AGENT=1. Captain's interactive shell
is unaffected.
EOF
        exit 1
        ;;
      *)
        # Any other secrets subcommand starts with a flag (--env, --path, etc.)
        # which means this is the bare listing form with flags. Deny.
        case "$SUBSUB" in
          --*|-*)
            cat >&2 <<EOF
infisical-wrapper: 'infisical secrets' (listing) prints unmasked values by default.

Use: crane_secret_check({path, env}) to verify presence (keys only).
EOF
            exit 1
            ;;
          *)
            # Unknown subcommand — pass through, let the real CLI complain.
            exec "$REAL_INFISICAL" "$@"
            ;;
        esac
        ;;
    esac
    ;;
  export)
    # Allow when piped (stdout not a tty) — bulk export to wrangler etc.
    if [ -t 1 ]; then
      cat >&2 <<EOF
infisical-wrapper: 'infisical export' to terminal dumps secret values.

To pipe to a bulk-import tool (e.g., wrangler secret bulk):
  infisical export --env <env> --path <path> --format json | wrangler secret bulk

To verify presence:
  crane_secret_check({path, env})
EOF
      exit 1
    fi
    exec "$REAL_INFISICAL" "$@"
    ;;
  *)
    # All other subcommands (run, login, logout, init, scan, etc.) pass through.
    exec "$REAL_INFISICAL" "$@"
    ;;
esac

#!/bin/bash
#
# bash-secret-deny — PreToolUse hook that blocks Bash commands likely to leak
# secret values into the transcript.
#
# Why: agents repeatedly leak values by running the natural verification command
# (`infisical secrets <path>` prints unmasked values by default). Memory-based
# mitigation has failed; this hook enforces the rule at command-construction
# time. Companion to harness-level permissions.deny in ~/.claude/settings.json,
# the crane_secret_check MCP tool, and the secret-leak-detector PostToolUse hook.
#
# Design:
#   - DENY + REDIRECT, never rewrite. Rewriting piped commands corrupts syntax
#     and trains agents to work around the hook.
#   - Word-boundary matching, not prefix matching, so `/abs/path/infisical …`
#     is caught.
#   - Single-pass unwrap of `bash -c "..."` / `sh -c '...'` quoted strings;
#     deeply nested `bash -c "bash -c ..."` is flagged as suspicious and denied.
#   - FAIL CLOSED on missing jq — exit 2 (deny). A leaking command running
#     under a silently-disabled hook is the failure mode this is preventing.
#
# Wire protocol (Claude Code PreToolUse):
#   stdin:  JSON with .session_id, .cwd, .tool_name, .tool_input, .hook_event_name
#   stdout: JSON {"hookSpecificOutput": {"hookEventName":"PreToolUse",
#                                        "permissionDecision":"deny",
#                                        "permissionDecisionReason":"..."}}
#   exit 0 (decision is in stdout JSON)
#
# Exit codes:
#   0 — emitted a decision (deny on stdout JSON, or no decision = pass-through)
#   2 — fail-closed deny (jq missing or other unrecoverable state); stderr
#       carries the reason

set -e

# ---------------------------------------------------------------------------
# Fail-closed guard: missing jq means we can't read the input or emit the
# response JSON. Treat as deny rather than letting the command run unchecked.
# ---------------------------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
  echo "bash-secret-deny: jq missing from PATH — failing closed (deny)" >&2
  exit 2
fi

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)

# Only inspect Bash invocations; everything else passes through.
if [ "$TOOL" != "Bash" ] || [ -z "$CMD" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Emit a deny decision and exit. Argument: redirect message.
# ---------------------------------------------------------------------------
emit_deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# ---------------------------------------------------------------------------
# Match `pattern` against `SCAN_TARGET` using grep -E. Returns 0 on match.
# ---------------------------------------------------------------------------
matches() {
  local pattern="$1"
  printf '%s' "$SCAN_TARGET" | grep -qE "$pattern"
}

# ---------------------------------------------------------------------------
# Unwrap a single layer of `bash -c "<inner>"` or `sh -c '<inner>'`. Sets
# UNWRAPPED to the inner string (or original if no wrapper). Detects nested
# wrapping (`bash -c "bash -c ..."`) and denies — that shape is almost never
# legitimate and is the canonical hook-evasion pattern.
# ---------------------------------------------------------------------------
unwrap_bash_c() {
  local input="$1"
  local inner

  if printf '%s' "$input" | grep -qE '^[[:space:]]*(/[^[:space:]]*/)?(bash|sh|zsh)[[:space:]]+-c[[:space:]]+'; then
    inner=$(printf '%s' "$input" | sed -E 's/^[[:space:]]*(\/[^[:space:]]*\/)?(bash|sh|zsh)[[:space:]]+-c[[:space:]]+//')
    # Strip surrounding quotes if present.
    case "$inner" in
      \"*\")
        inner="${inner#\"}"
        inner="${inner%\"}"
        ;;
      \'*\')
        inner="${inner#\'}"
        inner="${inner%\'}"
        ;;
    esac
    # Reject deeply-nested wrapping.
    if printf '%s' "$inner" | grep -qE '(^|[[:space:];|&])(/[^[:space:]]*/)?(bash|sh|zsh)[[:space:]]+-c[[:space:]]+'; then
      emit_deny "nested bash -c wrapping is not permitted (typical hook-evasion shape). Run the inner command directly."
    fi
    UNWRAPPED="$inner"
    return
  fi
  UNWRAPPED="$input"
}

UNWRAPPED=""
unwrap_bash_c "$CMD"

# Also scan inside $(...) and `...` command substitution. Concatenate the
# command + everything inside subshells so a single pass catches `infisical
# secrets` anywhere it might fire.
SUBSHELL_BODIES=$(printf '%s' "$CMD" | grep -oE '\$\([^)]*\)|`[^`]*`' || true)
SCAN_TARGET="$UNWRAPPED $SUBSHELL_BODIES"

# ---------------------------------------------------------------------------
# Detection patterns. Order matters — most specific first so the right
# redirect message fires.
# ---------------------------------------------------------------------------

# Helper: a "command-shape suffix" — a flag, pipe/redirect, statement
# separator, or end-of-string. Used to distinguish real command invocations
# from prose mentions like "use infisical secrets carefully" embedded in
# docs/commit messages that happen to live in a heredoc body.
CMD_SUFFIX='([[:space:]]+-{1,2}[a-zA-Z]|[[:space:]]*[|><;&]|[[:space:]]*$|[[:space:]]*\)|[[:space:]]*\"|[[:space:]]*'\'')'

# 1. `infisical secrets get NAME` — single-value read.
if matches "(^|[[:space:];|&\\\$\\(\`])(/[^[:space:]]*/)?infisical[[:space:]]+secrets[[:space:]]+get[[:space:]]+[A-Z_][A-Z0-9_]*"; then
  emit_deny "Single-value secret reads leak the value into the transcript. Use: infisical run --env <env> --path <path> -- <command-that-uses-\$VAR>  (the value lives in the child process env, not in your context). See docs/instructions/secrets.md."
fi

# 2. `infisical export` — bulk dump of values. Requires command-shape suffix.
if matches "(^|[[:space:];|&\\\$\\(\`])(/[^[:space:]]*/)?infisical[[:space:]]+export${CMD_SUFFIX}"; then
  emit_deny "infisical export dumps secret values into the transcript. To verify presence: crane_secret_check. To pipe values to another tool: infisical run --env <env> --path <path> -- <command>."
fi

# 3. `infisical secrets` (listing) — the canonical leak. Allow set/delete/folders.
#    Requires command-shape suffix: prose like "infisical secrets carefully" is
#    followed by a word char, not a flag/pipe/end-of-line, so it does NOT match.
if matches "(^|[[:space:];|&\\\$\\(\`])(/[^[:space:]]*/)?infisical[[:space:]]+secrets${CMD_SUFFIX}" \
   && ! matches 'infisical[[:space:]]+secrets[[:space:]]+(set|delete|folders|generate-example-env)([[:space:]]|$)'; then
  emit_deny "infisical secrets (listing) prints unmasked values by default. Use crane_secret_check to verify presence; it returns key names only."
fi

# 3b. Variable-indirection: line contains both `=infisical` assignment and `secrets` usage.
if matches '(^|[[:space:];])[A-Za-z_][A-Za-z0-9_]*=infisical([[:space:]]|;|$)' \
   && matches '\$\{?[A-Za-z_][A-Za-z0-9_]*\}?[[:space:]]+secrets([[:space:]]|$)'; then
  emit_deny "Variable indirection (\$VAR secrets ...) targeting infisical is treated as a leaky read. Use crane_secret_check or infisical run --."
fi

# 4. `cat .env*`, `head .env*`, `tail .env*`, `less .env*`, `bat .env*` — dotfile dumps.
if matches '(^|[[:space:];|&\$\(\`])(cat|head|tail|less|more|bat)[[:space:]]+[^;|&]*\.env([[:space:]]|$|\.|/)'; then
  emit_deny ".env files contain secret values. To list keys: awk -F= '/^[A-Z_]+=/ {print \$1}' <file>. To use values: infisical run --env <env> --path <path> -- <command>."
fi

# 5. `grep ... .env*` reading a file that may contain values.
if matches '(^|[[:space:];|&\$\(\`])grep[[:space:]]+[^;|&]*\.env([[:space:]]|$|\.|/)'; then
  emit_deny "grep against .env files reads secret values into the transcript. Use awk -F= for keys, or infisical run -- for values."
fi

# 6. Bare `printenv` (with or without redirect).
if matches '(^|[[:space:];|&\$\(\`])printenv([[:space:]]|>|;|$)'; then
  emit_deny "printenv dumps all environment variables, which under infisical run -- includes secret values. To list env-var NAMES: env | awk -F= '/^[A-Z_]+=/ {print \$1}'."
fi

# 7. Bare `env` (terminal or with redirect, NOT `env VAR=val cmd` and NOT `env | safe-tool`).
if matches '(^|[[:space:];|&\$\(\`])env([[:space:]]*>|[[:space:]]*;|[[:space:]]*$)'; then
  # Allow `env | awk …`, `env | grep …` etc. — read-only key projection.
  # (This branch fires on bare `env` and `env >file`, not on `env | …`.)
  emit_deny "bare env dumps all environment variables (values included). Use: env | awk -F= '/^[A-Z_]+=/ {print \$1}' to list names only."
fi
# Also catch `env | <unsafe>` shape. Allow only awk/grep/sed/cut/sort/head/tail/wc as the next pipe target.
if matches '(^|[[:space:];|&\$\(\`])env[[:space:]]*\|'; then
  if ! matches '(^|[[:space:];|&\$\(\`])env[[:space:]]*\|[[:space:]]*(awk|grep|sed|cut|sort|head|tail|wc)([[:space:]]|$)'; then
    emit_deny "env piped to a non-projection tool leaks values. Project to NAMES only: env | awk -F= '/^[A-Z_]+=/ {print \$1}'."
  fi
fi

# 8. `wrangler secret put NAME <literal>` — value in the command line.
#    Require the third arg to look like a real token (≥16 chars of
#    [A-Za-z0-9_.-]) so placeholders like "val" don't false-positive.
if matches '(^|[[:space:];|&\$\(\`])wrangler[[:space:]]+secret[[:space:]]+put[[:space:]]+[A-Z_][A-Z0-9_]*[[:space:]]+[A-Za-z0-9_.-]{16,}([[:space:]]|$|\)|\")'; then
  # Allow $VAR ref, allow stdin redirect.
  if ! matches 'wrangler[[:space:]]+secret[[:space:]]+put[[:space:]]+[A-Z_][A-Z0-9_]*[[:space:]]+(\$|<)'; then
    emit_deny "wrangler secret put with a literal value embeds the secret in the command line and transcript. Use stdin form (echo VAR | wrangler secret put NAME), or: infisical run -- wrangler secret bulk."
  fi
fi

# 9. `Authorization: Bearer <literal>` in an HTTP header arg.
#    Require the token to be ≥16 token-shaped chars to avoid false-positives
#    on placeholders or example text.
if matches 'Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.-]{16,}'; then
  emit_deny "Bearer token embedded as literal in Authorization header leaks into the transcript. Set the token as an env var and reference it via \$TOKEN, invoked under infisical run -- curl ..."
fi

# 10. `eval`/`source` laundering of infisical output.
#     Previous version included `.` (the dot-builtin) in the alternation, but
#     `\.[[:space:]]+` matched ordinary sentence-ending periods in prose
#     embedded in command lines (e.g., `gh pr create --body "...infisical
#     secrets...Use this. Next sentence..."`), producing false positives in
#     legitimate documentation. The dot-builtin is rare in agent-emitted
#     commands; dropping it from the alternation is the right tradeoff.
if matches '(^|[[:space:];|&\$\(\`])(eval|source)[[:space:]]+' && matches 'infisical[[:space:]]+secrets'; then
  emit_deny "eval/source of infisical output captures values into the shell environment without going through the safe channel. Use infisical run --env <env> --path <path> -- <command>."
fi

# 11. Command substitution capturing infisical output into a shell var.
if matches '=[[:space:]]*\$\([[:space:]]*infisical[[:space:]]+secrets' \
   || matches '=[[:space:]]*`[[:space:]]*infisical[[:space:]]+secrets'; then
  emit_deny "Capturing infisical secrets output into a shell variable puts the value in your context. Use: infisical run --env <env> --path <path> -- <command-that-references-\$VAR>."
fi

# No match — pass through with no decision (other hooks and default permissions apply).
exit 0

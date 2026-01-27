# Recovery Quick Reference

**One-pager for common issues. Fix in <2 minutes or escalate.**

---

## "API key invalid" / "Authentication failed"

```bash
export BW_SESSION=$(bw unlock --raw)
bash scripts/refresh-secrets.sh
source ~/.zshrc   # or ~/.bashrc on Linux
bash scripts/preflight-check.sh
```

---

## "CRANE_CONTEXT_KEY not set" / "ANTHROPIC_API_KEY not set"

```bash
source ~/.zshrc   # or ~/.bashrc on Linux
```

If still missing:
```bash
export BW_SESSION=$(bw unlock --raw)
bash scripts/refresh-secrets.sh
source ~/.zshrc
```

---

## "CLI not found" (claude/codex/gemini)

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
```

---

## "Can't reach crane-context" / Network errors

```bash
# Check internet
curl -s https://google.com > /dev/null && echo "Internet OK" || echo "No internet"

# Check worker
curl -s https://crane-context.automation-ab6.workers.dev/health | jq .
```

If worker is down: Wait or escalate. Not a local issue.

---

## "Bitwarden vault locked"

```bash
export BW_SESSION=$(bw unlock --raw)
```

If "not logged in":
```bash
bw login
export BW_SESSION=$(bw unlock --raw)
```

---

## "Claude Code asks for browser login"

API key conflict with Console auth. Fix:
```bash
# Ensure API key is set
echo $ANTHROPIC_API_KEY | head -c 20

# Ensure onboarding flag is set
cat ~/.claude.json | jq .hasCompletedOnboarding
# Should show: true

# If false or missing:
echo '{"hasCompletedOnboarding": true}' > ~/.claude.json
```

---

## "/sod shows no context" / Empty handoff

```bash
# Verify key is loaded
echo $CRANE_CONTEXT_KEY | head -c 20

# If empty, reload shell config
source ~/.zshrc

# Test API directly
curl -s https://crane-context.automation-ab6.workers.dev/health | jq .
```

---

## "Wrong repo" / Issues going to wrong venture

1. Check git remote: `git remote -v`
2. Verify you're in correct directory: `pwd`
3. Re-run `/sod` and confirm context box shows correct venture/repo

---

## Preflight check fails

Run preflight to see what's broken:
```bash
bash scripts/preflight-check.sh
```

Fix each failing item using sections above.

---

## Nuclear Option (Full Reset)

When nothing else works:

```bash
export BW_SESSION=$(bw unlock --raw)
cd ~/dev/crane-console
git pull origin main
bash scripts/setup-dev-box.sh
source ~/.zshrc
bash scripts/preflight-check.sh
bash scripts/smoke-test.sh
```

---

## Still Stuck?

**Escalation trigger:** If not fixed in 5 minutes, stop.

1. Note what you tried
2. File issue or ask Captain
3. Do NOT spend hours debugging

See `team-workflow.md` → "Escalation Triggers" section.

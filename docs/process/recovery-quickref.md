# Recovery Quick Reference

**One-pager for common issues. Fix in <2 minutes or escalate.**

---

## "API key invalid" / "Authentication failed"

```bash
infisical login   # browser OAuth
crane vc          # relaunch — fetches secrets fresh from Infisical
```

---

## "CRANE_CONTEXT_KEY not set" / "ANTHROPIC_API_KEY not set"

The `crane` launcher reads from Infisical at session-launch time. If a secret is missing:

```bash
infisical login           # if your session expired
crane vc                  # relaunch with fresh secrets
```

If a secret was rotated since this machine last ran, `crane vc` will pick up the new value automatically on the next launch — no separate refresh step.

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

## "Infisical session expired"

```bash
infisical login
# Opens browser → OAuth → token stored in macOS Keychain
```

If headless (no browser available), use Universal Auth with `CLIENT_ID` + `CLIENT_SECRET` from the operator's personal credential store:

```bash
infisical login --method=universal-auth \
  --client-id="$CLIENT_ID" --client-secret="$CLIENT_SECRET"
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

## "/sos shows no context" / Empty handoff

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
3. Re-run `/sos` and confirm context box shows correct venture/repo

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
cd ~/dev/crane-console
git pull origin main
bash scripts/bootstrap-machine.sh
infisical login
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

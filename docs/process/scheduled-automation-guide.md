# Scheduled Automation Guide

**Version:** 1.0
**Date:** February 2, 2026
**Purpose:** Document available scheduling mechanisms and use cases for VC automation

---

## Overview

Three main mechanisms for scheduled automation:

| Mechanism                     | Best For                 | Environment     |
| ----------------------------- | ------------------------ | --------------- |
| Cron + `claude -p`            | Local machine automation | Dev machines    |
| GitHub Actions `on: schedule` | CI/CD automation         | GitHub runners  |
| Cloudflare Cron Triggers      | Worker-based tasks       | Cloudflare edge |

---

## Mechanism 1: Cron + Claude Pipe Mode

### Overview

Run Claude Code in pipe mode (`-p`) from cron for local automation.

### Use Cases

- Daily commit message generation
- Weekly code review summaries
- Pre-work context preparation
- Automated documentation updates

### Setup

**1. Create automation script:**

```bash
#!/bin/bash
# scripts/daily-summary.sh

set -e

cd /path/to/repo

# Run Claude in pipe mode with prompt
claude -p "Summarize the git log from the last 24 hours.
Focus on: what changed, who contributed, any patterns.
Output as markdown." > /tmp/daily-summary.md

# Optional: commit the summary
# git add docs/summaries/
# git commit -m "chore: daily summary $(date +%Y-%m-%d)"
```

**2. Add to crontab:**

```bash
# Edit crontab
crontab -e

# Run daily at 9am
0 9 * * * /path/to/scripts/daily-summary.sh >> /var/log/daily-summary.log 2>&1

# Run weekly on Monday at 9am
0 9 * * 1 /path/to/scripts/weekly-review.sh >> /var/log/weekly-review.log 2>&1
```

**3. Verify:**

```bash
# List current crontab
crontab -l

# Test manually
/path/to/scripts/daily-summary.sh
```

### macOS: Using launchd

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.venturecrane.daily-summary</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/scripts/daily-summary.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/daily-summary.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/daily-summary-error.log</string>
</dict>
</plist>
```

```bash
# Install
cp com.venturecrane.daily-summary.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.venturecrane.daily-summary.plist

# Verify
launchctl list | grep venturecrane
```

---

## Mechanism 2: GitHub Actions Schedule

### Overview

Use GitHub Actions `on: schedule` for CI/CD automation.

### Use Cases

- Daily dependency audits
- Weekly issue triage
- Monthly security scans
- Automated PR creation for updates

### Example: Daily Security Audit

```yaml
# .github/workflows/scheduled-security.yml
name: Scheduled Security Audit

on:
  schedule:
    # Run daily at 6am UTC
    - cron: '0 6 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Check for vulnerabilities
        run: |
          VULN_COUNT=$(npm audit --json | jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical')
          if [ "$VULN_COUNT" -gt 0 ]; then
            echo "Found $VULN_COUNT high/critical vulnerabilities"
            # Could create issue or notify here
          fi
```

### Example: Weekly Issue Triage

```yaml
# .github/workflows/weekly-triage.yml
name: Weekly Issue Triage

on:
  schedule:
    # Run every Monday at 8am UTC
    - cron: '0 8 * * 1'
  workflow_dispatch:

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Get stale issues
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          echo "## Stale Issues (no activity in 14 days)" > triage-report.md
          gh issue list \
            --repo ${{ github.repository }} \
            --state open \
            --json number,title,updatedAt \
            --jq '.[] | select((.updatedAt | fromdateiso8601) < (now - 1209600)) | "- #\(.number): \(.title)"' \
            >> triage-report.md

          cat triage-report.md

      - name: Post to issue (optional)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Could create a triage issue or comment
          echo "Triage report generated"
```

### Cron Syntax Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday=0)
│ │ │ │ │
* * * * *
```

Common patterns:

- `0 9 * * *` - Daily at 9am UTC
- `0 9 * * 1` - Weekly on Monday at 9am UTC
- `0 0 1 * *` - Monthly on the 1st at midnight UTC
- `*/15 * * * *` - Every 15 minutes

---

## Mechanism 3: Cloudflare Cron Triggers

### Overview

Run Worker code on a schedule at the edge.

### Use Cases

- Session cleanup in crane-context
- Health checks / monitoring
- Data aggregation / reporting
- Scheduled notifications

### Setup

**1. Add cron trigger to wrangler.toml:**

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"

[triggers]
crons = ["0 * * * *"]  # Every hour
```

**2. Handle scheduled event in Worker:**

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Normal HTTP handler
    return new Response('OK')
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Scheduled handler
    console.log(`Cron triggered at ${controller.scheduledTime}`)

    switch (controller.cron) {
      case '0 * * * *':
        await hourlyCleanup(env)
        break
      case '0 0 * * *':
        await dailyReport(env)
        break
    }
  },
}

async function hourlyCleanup(env: Env) {
  // Cleanup expired sessions
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()
}

async function dailyReport(env: Env) {
  // Generate daily stats
  const stats = await env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE created_at > ?')
    .bind(Date.now() - 86400000)
    .first()

  console.log(`Sessions created in last 24h: ${stats?.count}`)
}
```

**3. Deploy:**

```bash
npx wrangler deploy
```

**4. Verify cron triggers:**

```bash
# List triggers
npx wrangler triggers list

# View logs for scheduled events
npx wrangler tail --format pretty
```

### crane-context Cron (Existing)

Crane-context already has cron capability for session management:

```toml
# workers/crane-context/wrangler.toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```

---

## Best Practices

### Idempotency

All scheduled tasks should be idempotent - running twice should not cause problems.

```typescript
// Good: Idempotent
async function cleanup(env: Env) {
  // DELETE is idempotent - running twice is fine
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()
}

// Bad: Not idempotent
async function createReport(env: Env) {
  // INSERT creates duplicates if run twice
  await env.DB.prepare('INSERT INTO reports (date, data) VALUES (?, ?)').bind(today, data).run()
}

// Fixed: Check before insert
async function createReport(env: Env) {
  const existing = await env.DB.prepare('SELECT id FROM reports WHERE date = ?').bind(today).first()

  if (!existing) {
    await env.DB.prepare('INSERT INTO reports (date, data) VALUES (?, ?)').bind(today, data).run()
  }
}
```

### Error Handling

Log errors but don't let them crash scheduled tasks.

```typescript
async function scheduled(controller: ScheduledController, env: Env) {
  try {
    await riskyOperation(env)
  } catch (error) {
    console.error('Scheduled task failed:', error)
    // Optionally: send alert, create issue, etc.
  }
}
```

### Monitoring

Track scheduled task execution.

```typescript
async function scheduled(controller: ScheduledController, env: Env) {
  const startTime = Date.now()

  try {
    await task(env)
    console.log(`Task completed in ${Date.now() - startTime}ms`)
  } catch (error) {
    console.error(`Task failed after ${Date.now() - startTime}ms:`, error)
  }
}
```

---

## Mechanism 4: systemd System Timer on `mini`

### Overview

The always-on Ubuntu Server box (`mini`) is the fleet's natural home for recurring ops workflows that need shell access to every other machine (SSH targets, local apt/brew tooling, Infisical-seeded env). The Hermes fleet_update orchestrator (#657) is the reference implementation.

**Key property:** `mini` runs headless with no interactive user, so a **system** timer — not a user timer + `loginctl enable-linger` — is the right shape. User timers on headless boxes have silent-death failure modes (logind/DBUS state regenerates on cold boot). System timers just work.

### Use Cases

- Ops workflows that SSH into every fleet machine (fleet health audits, config drift detection, backup orchestration).
- Long-running agent invocations that need a git checkout + ExecStartPre to pin a known source SHA.
- Anything too heavy for a Cloudflare Worker (no SSH access) and too stateful for GitHub Actions (runner has no persistent fleet-trust relationships).

### Setup

Canonical sources live in the repo under `tools/hermes/systemd/*.service` and `*.timer`. A provisioner (`scripts/provision-hermes-fleet-update.sh`) installs them to `/etc/systemd/system/` — never to `~/.config/systemd/user/`, for the reason above.

Minimal service shape:

```ini
[Unit]
Description=My scheduled workflow
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=smdurgan
Group=smdurgan
WorkingDirectory=/srv/crane-console
EnvironmentFile=/etc/my-workflow/my-workflow.env
ExecStartPre=/usr/bin/git -C /srv/crane-console fetch --quiet
ExecStartPre=/usr/bin/git -C /srv/crane-console reset --quiet --hard origin/main
ExecStart=/home/smdurgan/.local/bin/my-command
StandardOutput=append:/var/log/my-workflow/run.log
StandardError=append:/var/log/my-workflow/run.log
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/crane-console /var/log/my-workflow /home/smdurgan
PrivateTmp=true
```

Timer:

```ini
[Unit]
Description=Run my-workflow weekly Sunday 07:20 local

[Timer]
OnCalendar=Sun *-*-* 07:20:00
RandomizedDelaySec=15min
Unit=my-workflow.service

[Install]
WantedBy=timers.target
```

**Intentionally absent: `Persistent=true`.** For weekly workflows paired with an independent nightly safety floor (like `unattended-upgrades`), a missed fire isn't urgent enough to catch up at the next boot. Use it only if a missed run is genuinely actionable.

### Drift control via `ExecStartPre` git-reset

The double `ExecStartPre=` pattern (fetch then reset --hard origin/main) makes the in-repo canonical source the live source — edits committed to main take effect on the next fire, with no separate deployment. Record the SHA (`git -C /srv/crane-console rev-parse HEAD`) in whatever telemetry the workflow ingests so stale-code drift is visible if the reset fails.

### Heartbeat

Long-cadence jobs need an out-of-band "did it actually run?" signal. The orchestrator model: each run POSTs a full-state snapshot with a `generated_at` timestamp. The SOS then checks whether the newest open finding is stale relative to the expected cadence (for a weekly timer, > 10 days ≈ stuck). No separate heartbeat endpoint needed — the snapshot itself is the heartbeat.

---

## Choosing a Mechanism

| Requirement                        | Recommended                  |
| ---------------------------------- | ---------------------------- |
| Needs local files/repos            | Cron + claude -p             |
| Needs GitHub API                   | GitHub Actions               |
| Needs D1 database                  | Cloudflare Cron              |
| Needs to run even if laptop closed | GitHub Actions or Cloudflare |
| Needs fleet-wide SSH               | **systemd on mini**          |
| Complex multi-step with AI         | Cron + claude -p             |
| Simple data operations             | Cloudflare Cron              |
| CI/CD related                      | GitHub Actions               |

---

## Related Documentation

- `team-workflow.md` - Team processes these automations support
- `crane-relay-api.md` - Relay endpoints for automation
- `workers/crane-context/CLAUDE.md` - Context Worker specifics
- `../instructions/fleet-ops.md` - Hermes-on-mini orchestrator architecture
- `../../tools/hermes/systemd/` - Canonical systemd unit sources

#!/usr/bin/env bash
#
# provision-session-push.sh
#
# One-shot installer for the per-machine session-push cron. Detects OS and
# installs the appropriate unit (launchd plist on macOS, systemd
# timer+service on Linux). Provisions secrets via Infisical to
# ~/.crane/session-push.env at mode 0600 - WITHOUT this, the cron runs
# with empty admin key and gets 401s silently.
#
# Prerequisites:
#   - infisical CLI installed and `infisical login` run on this machine
#   - The crane-console checkout at $CRANE_CONSOLE_PATH (defaults to
#     ~/dev/crane-console)
#
# Usage:
#   bash scripts/provision-session-push.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

CRANE_CONSOLE_PATH="${CRANE_CONSOLE_PATH:-$HOME/dev/crane-console}"
ENV_FILE="$HOME/.crane/session-push.env"

if [[ ! -d "$CRANE_CONSOLE_PATH" ]]; then
  echo "ERROR: crane-console checkout not found at $CRANE_CONSOLE_PATH"
  echo "Set CRANE_CONSOLE_PATH or clone the repo there first."
  exit 1
fi

# 1. Provision secrets via Infisical
mkdir -p "$(dirname "$ENV_FILE")"
echo "Provisioning secrets via Infisical to $ENV_FILE"

if $DRY_RUN; then
  echo "DRY-RUN would run: infisical export --env=prod --path=/vc --format=dotenv"
else
  if ! command -v infisical >/dev/null 2>&1; then
    echo "ERROR: infisical CLI not found. Install per docs/infra/secrets-rotation-runbook.md."
    exit 1
  fi
  # Export ONLY the keys we need; refuses to write the file if any are missing
  tmp_env="$(mktemp)"
  infisical export --env=prod --path=/vc --format=dotenv > "$tmp_env"
  if ! grep -q '^CRANE_ADMIN_KEY=' "$tmp_env"; then
    echo "ERROR: CRANE_ADMIN_KEY missing from Infisical /vc - cannot provision"
    rm -f "$tmp_env"
    exit 1
  fi
  if ! grep -q '^CRANE_CONTEXT_KEY=' "$tmp_env"; then
    echo "ERROR: CRANE_CONTEXT_KEY missing from Infisical /vc - cannot provision"
    rm -f "$tmp_env"
    exit 1
  fi
  # Default base if not in Infisical
  if ! grep -q '^CRANE_CONTEXT_BASE=' "$tmp_env"; then
    echo 'CRANE_CONTEXT_BASE=https://crane-context.automation-ab6.workers.dev' >> "$tmp_env"
  fi
  mv "$tmp_env" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (mode 0600)"
fi

# 2. Install OS-appropriate unit
case "$(uname -s)" in
  Darwin)
    PLIST_SRC="$CRANE_CONSOLE_PATH/scripts/launchd/com.craneconsole.session-push.plist"
    PLIST_DEST="$HOME/Library/LaunchAgents/com.craneconsole.session-push.plist"
    LOG_DIR="$HOME/Library/Logs"

    if [[ ! -f "$PLIST_SRC" ]]; then
      echo "ERROR: plist source not found at $PLIST_SRC"
      exit 1
    fi

    mkdir -p "$LOG_DIR" "$(dirname "$PLIST_DEST")"

    if $DRY_RUN; then
      echo "DRY-RUN would render plist with HOME=$HOME and PATH=$CRANE_CONSOLE_PATH"
      echo "DRY-RUN would launchctl unload (if loaded) + load -w $PLIST_DEST"
    else
      # Render placeholder substitutions. Pull keys from the env file we
      # just wrote so the plist EnvironmentVariables block has real values.
      # shellcheck disable=SC1090
      set -a; source "$ENV_FILE"; set +a
      sed \
        -e "s|__CRANE_CONSOLE_PATH__|$CRANE_CONSOLE_PATH|g" \
        -e "s|__HOME__|$HOME|g" \
        -e "s|__CRANE_ADMIN_KEY__|${CRANE_ADMIN_KEY}|g" \
        -e "s|__CRANE_CONTEXT_KEY__|${CRANE_CONTEXT_KEY}|g" \
        -e "s|__CRANE_CONTEXT_BASE__|${CRANE_CONTEXT_BASE:-https://crane-context.automation-ab6.workers.dev}|g" \
        "$PLIST_SRC" > "$PLIST_DEST"
      chmod 600 "$PLIST_DEST"

      # Reload (unload then load) so changes take effect
      launchctl unload "$PLIST_DEST" 2>/dev/null || true
      launchctl load -w "$PLIST_DEST"
      echo "Loaded launchd unit: $PLIST_DEST"
      echo "Daily run at 03:17 local. Logs: $LOG_DIR/com.craneconsole.session-push.log"
    fi
    ;;

  Linux)
    SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
    TIMER_SRC="$CRANE_CONSOLE_PATH/tools/hermes/systemd/session-push.timer"
    SERVICE_SRC="$CRANE_CONSOLE_PATH/tools/hermes/systemd/session-push.service"
    TIMER_DEST="$SYSTEMD_USER_DIR/session-push.timer"
    SERVICE_DEST="$SYSTEMD_USER_DIR/session-push.service"

    if [[ ! -f "$TIMER_SRC" || ! -f "$SERVICE_SRC" ]]; then
      echo "ERROR: systemd unit sources not found"
      exit 1
    fi

    mkdir -p "$SYSTEMD_USER_DIR"

    if $DRY_RUN; then
      echo "DRY-RUN would install user-level systemd units and enable timer"
    else
      # Render placeholders (use system service path if /var/log/ is writable
      # by the user; otherwise consider falling back to journal logs)
      sed \
        -e "s|__CRANE_USER__|$USER|g" \
        -e "s|__CRANE_CONSOLE_PATH__|$CRANE_CONSOLE_PATH|g" \
        -e "s|__HOME__|$HOME|g" \
        "$SERVICE_SRC" > "$SERVICE_DEST"
      cp "$TIMER_SRC" "$TIMER_DEST"

      # User-level systemd doesn't need /var/log; redirect logs to journal
      sed -i 's|append:/var/log/session-push/run.log|journal|g' "$SERVICE_DEST"
      sed -i '/ReadWritePaths=/d' "$SERVICE_DEST"
      sed -i 's|^User=.*|# User=template; user systemd ignores this directive|' "$SERVICE_DEST"

      systemctl --user daemon-reload
      systemctl --user enable --now session-push.timer
      echo "Installed user-level systemd units"
      echo "Daily run at 03:17 local. View logs: journalctl --user -u session-push.service"
    fi
    ;;

  *)
    echo "ERROR: unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "Provisioning complete."

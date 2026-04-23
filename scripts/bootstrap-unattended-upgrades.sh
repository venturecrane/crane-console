#!/bin/bash
#
# Bootstrap unattended-upgrades on a Linux (Debian/Ubuntu) fleet machine.
#
# Security-only floor. No feature upgrades. No auto-reboot.
# This is the fallback if the Hermes-on-mini orchestrator is offline:
# security patches land nightly regardless.
#
# Idempotent: re-running is safe.
#
# Usage:
#   sudo bash scripts/bootstrap-unattended-upgrades.sh
#
# Or invoked non-interactively from bootstrap-machine.sh on Linux.
#

set -e
set -o pipefail

# Only run on Linux. macOS machines are handled by the orchestrator per-run.
OS_RAW=$(uname -s)
if [ "$OS_RAW" != "Linux" ]; then
    echo "[skip] bootstrap-unattended-upgrades.sh is Linux-only (detected: $OS_RAW)"
    exit 0
fi

# Require apt-based distro. Script is written for Debian/Ubuntu/Xubuntu.
if ! command -v apt-get >/dev/null 2>&1; then
    echo "[error] apt-get not found. Script supports Debian/Ubuntu only." >&2
    exit 1
fi

# Require root (via sudo or direct).
if [ "$(id -u)" -ne 0 ]; then
    echo "[error] Must run as root (use sudo)." >&2
    exit 1
fi

echo "[info] Installing unattended-upgrades and apt-listchanges..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    unattended-upgrades \
    apt-listchanges >/dev/null

# Detect distro codename for the origin pattern. lsb_release is present on
# Ubuntu/Xubuntu by default; fall back to /etc/os-release otherwise.
if command -v lsb_release >/dev/null 2>&1; then
    DISTRO_ID=$(lsb_release -is)
else
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID^}"  # capitalize first letter to match lsb_release -is
fi

echo "[info] Distro detected: $DISTRO_ID"

# /etc/apt/apt.conf.d/50unattended-upgrades — security origins only.
# ${distro_codename} is expanded by unattended-upgrades at runtime.
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
// Managed by scripts/bootstrap-unattended-upgrades.sh (crane fleet).
// Security-only. No feature upgrades. No auto-reboot.
// Manual edits will be overwritten on next bootstrap run.

Unattended-Upgrade::Allowed-Origins {
    "${DISTRO_ID}:\${distro_codename}-security";
    "${DISTRO_ID}ESMApps:\${distro_codename}-apps-security";
    "${DISTRO_ID}ESM:\${distro_codename}-infra-security";
};

Unattended-Upgrade::DevRelease "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::SyslogEnable "true";
EOF
echo "[ok] wrote /etc/apt/apt.conf.d/50unattended-upgrades"

# /etc/apt/apt.conf.d/20auto-upgrades — enable the periodic job.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
// Managed by scripts/bootstrap-unattended-upgrades.sh (crane fleet).
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
echo "[ok] wrote /etc/apt/apt.conf.d/20auto-upgrades"

# Ensure the unattended-upgrades systemd service is enabled (package default
# on most Ubuntu releases, but re-assert for safety).
systemctl enable unattended-upgrades.service >/dev/null 2>&1 || true
systemctl start unattended-upgrades.service >/dev/null 2>&1 || true

# Dry-run to verify the config parses and matches security-only origins.
echo ""
echo "[info] Dry-run verification (unattended-upgrade --dry-run):"
if unattended-upgrade --dry-run 2>&1 | head -20; then
    echo "[ok] unattended-upgrades configured successfully"
else
    echo "[warn] dry-run returned non-zero — inspect manually" >&2
fi

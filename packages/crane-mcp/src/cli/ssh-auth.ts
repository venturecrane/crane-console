/**
 * SSH session authentication helpers for the crane launcher.
 *
 * When running over SSH, macOS Keychain is locked so both Infisical
 * (user login token) and Claude Code (OAuth token) fail. This module:
 *
 * 1. Detects SSH sessions
 * 2. Logs into Infisical via Universal Auth (Machine Identity)
 * 3. Prompts the user to unlock the macOS keychain for Claude Code
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, statSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

interface UACredentials {
  clientId: string;
  clientSecret: string;
}

export interface SSHAuthResult {
  /** Extra env vars to merge into the child process */
  env: Record<string, string>;
  /** If set, the launcher should print this and abort */
  abort?: string;
}

/** Check if we're inside an SSH session */
export function isSSHSession(): boolean {
  return !!(
    process.env.SSH_CLIENT ||
    process.env.SSH_TTY ||
    process.env.SSH_CONNECTION
  );
}

/** Check if we're on macOS */
export function isMacOS(): boolean {
  return platform() === "darwin";
}

/** Read Universal Auth credentials from ~/.infisical-ua */
export function readUACredentials(): UACredentials | null {
  const filePath = join(homedir(), ".infisical-ua");

  try {
    const stat = statSync(filePath);
    // Warn (but don't block) if permissions are too open
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      console.warn(
        `Warning: ~/.infisical-ua has permissions ${mode.toString(8)}, expected 600`
      );
    }
  } catch {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let clientId = "";
    let clientSecret = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();

      if (key === "INFISICAL_UA_CLIENT_ID") clientId = value;
      if (key === "INFISICAL_UA_CLIENT_SECRET") clientSecret = value;
    }

    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

/** Login to Infisical using Universal Auth. Returns the JWT token. */
export function loginWithUniversalAuth(creds: UACredentials): string | null {
  try {
    const result = execSync(
      `infisical login --method=universal-auth --client-id=${creds.clientId} --client-secret=${creds.clientSecret} --plain --silent`,
      { stdio: ["pipe", "pipe", "pipe"], timeout: 15000 }
    );
    const token = result.toString().trim();
    return token || null;
  } catch {
    return null;
  }
}

/** Check if the macOS keychain is locked by trying to read the credential value */
export function isKeychainLocked(): boolean {
  try {
    // Use -w to read the actual password value, not just metadata.
    // Metadata is always accessible, but the value requires the keychain
    // to be unlocked AND the calling process to have ACL access.
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { stdio: ["pipe", "pipe", "pipe"], timeout: 5000 }
    );
    // If command succeeds AND returns non-empty, keychain is accessible
    return !result.toString().trim();
  } catch {
    // Command failed - keychain is locked or entry doesn't exist
    return true;
  }
}

/** Prompt user to unlock the macOS keychain interactively */
export function unlockKeychain(): boolean {
  console.log("\nSSH session detected - macOS keychain is locked.");
  console.log("Enter your macOS login password to unlock it:\n");

  const result = spawnSync(
    "security",
    ["unlock-keychain", `${homedir()}/Library/Keychains/login.keychain-db`],
    { stdio: "inherit", timeout: 30000 }
  );

  if (result.status !== 0) return false;

  // Verify the credential is now actually readable
  return !isKeychainLocked();
}

/**
 * Orchestrator: prepare auth for an SSH session.
 * Returns env vars to merge and optionally an abort message.
 */
export function prepareSSHAuth(debug: boolean = false): SSHAuthResult {
  if (!isSSHSession()) {
    if (debug) console.log("[debug] Not an SSH session, skipping SSH auth");
    return { env: {} };
  }

  if (debug) console.log("[debug] SSH session detected");

  const env: Record<string, string> = {};

  // --- Infisical: Universal Auth ---
  const creds = readUACredentials();
  if (!creds) {
    return {
      env: {},
      abort:
        "SSH session detected but ~/.infisical-ua not found.\n" +
        "Run: bash scripts/bootstrap-infisical-ua.sh",
    };
  }

  if (debug) console.log("[debug] Found UA credentials, logging in...");

  const token = loginWithUniversalAuth(creds);
  if (!token) {
    return {
      env: {},
      abort:
        "Infisical Universal Auth login failed.\n" +
        "Check credentials in ~/.infisical-ua or re-run: bash scripts/bootstrap-infisical-ua.sh",
    };
  }

  env.INFISICAL_TOKEN = token;
  if (debug) console.log("[debug] Infisical UA login successful");

  // --- Claude Code: keychain unlock ---
  if (isMacOS()) {
    if (isKeychainLocked()) {
      const unlocked = unlockKeychain();
      if (!unlocked) {
        return {
          env,
          abort:
            "Failed to unlock macOS keychain.\n" +
            "Claude Code needs keychain access for OAuth tokens.",
        };
      }
      if (debug) console.log("[debug] Keychain unlocked successfully");
    } else {
      if (debug) console.log("[debug] Keychain already unlocked");
    }
  }

  return { env };
}

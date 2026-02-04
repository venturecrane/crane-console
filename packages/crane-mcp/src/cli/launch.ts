#!/usr/bin/env node
/**
 * crane - Venture launcher CLI
 *
 * Launches Claude into any venture with proper secrets context.
 *
 * Usage:
 *   crane          # Interactive menu
 *   crane vc       # Direct launch into Venture Crane
 *   crane --list   # Show ventures without launching
 */

import { createInterface } from "readline";
import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { Venture } from "../lib/crane-api.js";
import { scanLocalRepos, LocalRepo } from "../lib/repo-scanner.js";

const API_BASE = "https://crane-context.automation-ab6.workers.dev";

// Venture code to Infisical path mapping
const INFISICAL_PATHS: Record<string, string> = {
  vc: "/vc",
  ke: "/ke",
  sc: "/sc",
  dfg: "/dfg",
  smd: "/smd",
};

interface VentureWithRepo extends Venture {
  localPath: string | null;
}

async function fetchVentures(): Promise<Venture[]> {
  try {
    const response = await fetch(`${API_BASE}/ventures`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = (await response.json()) as { ventures: Venture[] };
    return data.ventures;
  } catch (error) {
    console.error("Failed to fetch ventures from API");
    throw error;
  }
}

function matchVenturesToRepos(ventures: Venture[]): VentureWithRepo[] {
  const repos = scanLocalRepos();
  return ventures.map((v) => {
    const repo = repos.find(
      (r) => r.org.toLowerCase() === v.org.toLowerCase()
    );
    return {
      ...v,
      localPath: repo?.path || null,
    };
  });
}

function printVentureList(ventures: VentureWithRepo[]): void {
  console.log("\nCrane Ventures");
  console.log("==============\n");

  for (let i = 0; i < ventures.length; i++) {
    const v = ventures[i];
    const num = `${i + 1})`.padEnd(3);
    const name = v.name.padEnd(20);
    const code = `[${v.code}]`.padEnd(6);
    const path = v.localPath || "(not installed)";
    const status = v.localPath ? "" : " [!]";
    console.log(`  ${num} ${name} ${code} ${path}${status}`);
  }
  console.log();
}

async function promptSelection(
  ventures: VentureWithRepo[]
): Promise<VentureWithRepo | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const installedCount = ventures.filter((v) => v.localPath).length;
    rl.question(`Select (1-${installedCount}): `, (answer) => {
      rl.close();
      const num = parseInt(answer, 10);
      if (isNaN(num) || num < 1 || num > ventures.length) {
        resolve(null);
        return;
      }
      const selected = ventures[num - 1];
      if (!selected.localPath) {
        console.log(`\n${selected.name} is not installed locally.`);
        resolve(null);
        return;
      }
      resolve(selected);
    });
  });
}

function checkInfisicalSetup(repoPath: string, infisicalPath: string): { ok: boolean; error?: string } {
  // Check for .infisical.json in repo
  const configPath = join(repoPath, ".infisical.json");
  if (!existsSync(configPath)) {
    return {
      ok: false,
      error: `Missing .infisical.json in ${repoPath}\nRun: cp ~/dev/crane-console/.infisical.json ${repoPath}/`,
    };
  }

  // Check if Infisical path exists by trying to list secrets
  try {
    execSync(`infisical secrets --path ${infisicalPath} --env dev`, {
      cwd: repoPath,
      stdio: "pipe",
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: `Infisical path '${infisicalPath}' not found.\nCreate it in Infisical web UI: https://app.infisical.com`,
    };
  }
}

function launchClaude(venture: VentureWithRepo, debug: boolean = false): void {
  const infisicalPath = INFISICAL_PATHS[venture.code];
  if (!infisicalPath) {
    console.error(`No Infisical path configured for venture: ${venture.code}`);
    process.exit(1);
  }

  // Validate Infisical setup before launching
  const check = checkInfisicalSetup(venture.localPath!, infisicalPath);
  if (!check.ok) {
    console.error(`\nInfisical setup error for ${venture.name}:\n${check.error}`);
    process.exit(1);
  }

  console.log(`\n-> Switching to ${venture.name}...`);
  console.log(`-> Launching Claude with ${infisicalPath} secrets...\n`);

  // Change to the repo directory
  process.chdir(venture.localPath!);

  // Build command arguments
  // --silent suppresses infisical update warnings and tips
  const args = ["run", "--silent", "--path", infisicalPath, "--", "claude"];

  if (debug) {
    console.log(`[debug] cwd: ${venture.localPath}`);
    console.log(`[debug] command: infisical ${args.join(" ")}`);
  }

  // Use spawn without shell: true to avoid DEP0190 warning and potential loop issues
  // The shell option can cause problems with process spawning on some machines
  const child = spawn("infisical", args, {
    stdio: "inherit",
    cwd: venture.localPath!,
  });

  child.on("error", (err) => {
    console.error(`Failed to launch infisical: ${err.message}`);
    if (err.message.includes("ENOENT")) {
      console.error("Is infisical installed and in PATH?");
    }
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      if (debug) {
        console.log(`[debug] Process terminated by signal: ${signal}`);
      }
      // Map common signals to exit codes
      const signalCodes: Record<string, number> = {
        SIGTERM: 143,
        SIGINT: 130,
        SIGKILL: 137,
      };
      process.exit(signalCodes[signal] || 128);
    }
    if (debug && code !== 0) {
      console.log(`[debug] Process exited with code: ${code}`);
    }
    process.exit(code || 0);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug") || args.includes("-d");
  const filteredArgs = args.filter((a) => a !== "--debug" && a !== "-d");

  // Handle --list flag
  if (filteredArgs.includes("--list") || filteredArgs.includes("-l")) {
    const ventures = await fetchVentures();
    const withRepos = matchVenturesToRepos(ventures);
    printVentureList(withRepos);
    return;
  }

  // Handle --help flag
  if (filteredArgs.includes("--help") || filteredArgs.includes("-h")) {
    console.log(`
crane - Venture launcher for Claude

Usage:
  crane              Interactive menu - pick a venture, launch Claude
  crane <code>       Direct launch - e.g., crane vc, crane ke
  crane --list       Show ventures without launching
  crane --debug      Enable debug output for troubleshooting
  crane --help       Show this help

Venture codes:
  vc   Venture Crane
  ke   Kid Expenses
  sc   Silicon Crane
  dfg  Durgan Field Guide

Examples:
  crane              # Show menu, select venture
  crane vc           # Launch directly into Venture Crane
  crane ke --debug   # Launch with debug output
  crane --list       # List all ventures and their local paths
`);
    return;
  }

  // Fetch ventures
  const ventures = await fetchVentures();
  const withRepos = matchVenturesToRepos(ventures);

  // Direct launch by code
  const nonFlagArgs = filteredArgs.filter((a) => !a.startsWith("-"));
  if (nonFlagArgs.length > 0) {
    const code = nonFlagArgs[0].toLowerCase();
    const venture = withRepos.find((v) => v.code === code);

    if (!venture) {
      console.error(`Unknown venture code: ${code}`);
      console.error(`Available: ${withRepos.map((v) => v.code).join(", ")}`);
      process.exit(1);
    }

    if (!venture.localPath) {
      console.error(`Venture ${venture.name} is not installed locally.`);
      console.error(`Clone the repo to ~/dev/ first.`);
      process.exit(1);
    }

    launchClaude(venture, debug);
    return;
  }

  // Interactive menu
  console.log("\nCrane Console Launcher");
  console.log("======================");
  printVentureList(withRepos);

  const selected = await promptSelection(withRepos);
  if (!selected) {
    console.log("No venture selected.");
    process.exit(0);
  }

  launchClaude(selected, debug);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

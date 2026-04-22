// scripts/semgrep-canary.ts
//
// THROWAWAY PR — verifies that the required status check on main
// actually blocks merge when Semgrep goes red. Never merged.
// See docs/ci-verification/semgrep-initial-canary.md.

import { execSync, spawn } from 'child_process'

export function canaryChildProcessExec(userName: string): string {
  return execSync(`echo hello ${userName}`).toString()
}

export function canaryChildProcessSpawn(cmd: string): void {
  spawn(cmd)
}

export function canaryExecThird(venture: string): void {
  execSync(`gh repo list ${venture}`)
}

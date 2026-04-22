// scripts/semgrep-canary.ts
//
// TEMPORARY FILE — committed on a draft PR to prove the Semgrep CI gate
// catches real findings. The patterns below each match a distinct rule
// confirmed to fire under our pinned pack combination. If CI is green
// on this file, the gate is theatre. Delete before marking PR ready.

import { execSync, spawn } from 'child_process'

// Finding 1: child_process exec with function-argument tainted string
// (javascript.lang.security.detect-child-process.detect-child-process)
export function canaryChildProcessExec(userName: string): string {
  return execSync(`echo hello ${userName}`).toString()
}

// Finding 2: child_process spawn with function-argument tainted string
// (javascript.lang.security.detect-child-process.detect-child-process)
export function canaryChildProcessSpawn(cmd: string): void {
  spawn(cmd)
}

// Finding 3: non-literal exec with a different parameter name so rule fires twice
// (javascript.lang.security.detect-child-process.detect-child-process)
export function canaryExecThird(venture: string): void {
  execSync(`gh repo list ${venture}`)
}

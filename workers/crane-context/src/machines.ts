/**
 * Crane Context Worker - Machine Registry Logic
 *
 * Core D1 operations for machine registration, listing, heartbeat, and SSH mesh generation.
 */

import type { MachineRecord } from './types'
import { generateMachineId, nowIso } from './utils'

// ============================================================================
// Register Machine (Upsert on hostname)
// ============================================================================

export async function registerMachine(
  db: D1Database,
  params: {
    hostname: string
    tailscale_ip: string
    user: string
    os: string
    arch: string
    pubkey?: string
    role?: string
    meta?: Record<string, unknown>
    actor_key_id: string
  }
): Promise<{ machine: MachineRecord; created: boolean }> {
  const now = nowIso()

  // Check if machine already exists by hostname
  const existing = await db
    .prepare('SELECT * FROM machines WHERE hostname = ?')
    .bind(params.hostname)
    .first<MachineRecord>()

  if (existing) {
    // Update existing machine
    await db
      .prepare(
        `UPDATE machines
         SET tailscale_ip = ?, user = ?, os = ?, arch = ?,
             pubkey = COALESCE(?, pubkey), role = COALESCE(?, role),
             status = 'active', last_seen_at = ?,
             meta_json = COALESCE(?, meta_json), actor_key_id = ?
         WHERE hostname = ?`
      )
      .bind(
        params.tailscale_ip,
        params.user,
        params.os,
        params.arch,
        params.pubkey ?? null,
        params.role ?? null,
        now,
        params.meta ? JSON.stringify(params.meta) : null,
        params.actor_key_id,
        params.hostname
      )
      .run()

    const updated = await db
      .prepare('SELECT * FROM machines WHERE hostname = ?')
      .bind(params.hostname)
      .first<MachineRecord>()

    return { machine: updated!, created: false }
  }

  // Create new machine
  const id = generateMachineId()

  await db
    .prepare(
      `INSERT INTO machines (id, hostname, tailscale_ip, user, os, arch, pubkey, role, status, registered_at, last_seen_at, meta_json, actor_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.hostname,
      params.tailscale_ip,
      params.user,
      params.os,
      params.arch,
      params.pubkey ?? null,
      params.role ?? 'dev',
      now,
      now,
      params.meta ? JSON.stringify(params.meta) : null,
      params.actor_key_id
    )
    .run()

  const machine = await db
    .prepare('SELECT * FROM machines WHERE id = ?')
    .bind(id)
    .first<MachineRecord>()

  return { machine: machine!, created: true }
}

// ============================================================================
// List Active Machines
// ============================================================================

export async function listMachines(
  db: D1Database,
  status: string = 'active'
): Promise<MachineRecord[]> {
  const result = await db
    .prepare('SELECT * FROM machines WHERE status = ? ORDER BY hostname ASC')
    .bind(status)
    .all<MachineRecord>()

  return result.results
}

// ============================================================================
// Update Machine Heartbeat
// ============================================================================

export async function updateMachineHeartbeat(
  db: D1Database,
  machineId: string
): Promise<MachineRecord | null> {
  const now = nowIso()

  await db
    .prepare('UPDATE machines SET last_seen_at = ? WHERE id = ? AND status = ?')
    .bind(now, machineId, 'active')
    .run()

  return await db
    .prepare('SELECT * FROM machines WHERE id = ?')
    .bind(machineId)
    .first<MachineRecord>()
}

// ============================================================================
// Update Machine Heartbeat by Hostname (for /sod integration)
// ============================================================================

export async function touchMachineByHostname(db: D1Database, hostname: string): Promise<void> {
  const now = nowIso()

  await db
    .prepare('UPDATE machines SET last_seen_at = ? WHERE hostname = ? AND status = ?')
    .bind(now, hostname, 'active')
    .run()
}

// ============================================================================
// Generate SSH Mesh Config
// ============================================================================

export async function generateSshMeshConfig(
  db: D1Database,
  forHostname: string
): Promise<{ config: string; machine_count: number }> {
  const machines = await listMachines(db)

  // Exclude the requesting machine
  const peers = machines.filter((m) => m.hostname !== forHostname)

  const timestamp = new Date().toISOString()
  const lines: string[] = [
    '# Managed by Crane Context API -- do not edit manually',
    `# Generated for: ${forHostname}`,
    `# Last updated: ${timestamp}`,
    '',
  ]

  for (const peer of peers) {
    lines.push(`Host ${peer.hostname}`)
    lines.push(`    HostName ${peer.tailscale_ip}`)
    lines.push(`    User ${peer.user}`)
    lines.push('    IdentityFile ~/.ssh/id_ed25519')
    lines.push('    StrictHostKeyChecking accept-new')
    lines.push('    ServerAliveInterval 60')
    lines.push('    ServerAliveCountMax 3')
    lines.push('')
  }

  return {
    config: lines.join('\n'),
    machine_count: peers.length,
  }
}

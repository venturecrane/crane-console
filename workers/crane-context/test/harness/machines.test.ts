import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
  invoke,
  installWorkerdPolyfills,
} from '@venturecrane/crane-test-harness'
import worker from '../../src/index'
import type { Env } from '../../src/types'
import type { D1Database } from '@cloudflare/workers-types'

beforeAll(() => {
  installWorkerdPolyfills()
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

interface MachineRecord {
  id: string
  hostname: string
  tailscale_ip: string
  user: string
  os: string
  arch: string
  pubkey: string | null
  role: string
  status: string
  registered_at: string
  last_seen_at: string
  meta_json: string | null
  actor_key_id: string
}

interface RegisterResponse {
  machine: MachineRecord
  created: boolean
  correlation_id: string
}

interface ListMachinesResponse {
  machines: MachineRecord[]
  count: number
  correlation_id: string
}

const baseMachine = {
  hostname: 'test-mac23',
  tailscale_ip: '100.64.1.1',
  user: 'agent',
  os: 'darwin',
  arch: 'arm64',
}

describe('Machines endpoints (via harness)', () => {
  let db: D1Database
  let env: Env

  const headers = { 'X-Relay-Key': 'test-relay-key' }

  beforeEach(async () => {
    db = createTestD1()
    await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
    env = {
      DB: db,
      CONTEXT_RELAY_KEY: 'test-relay-key',
      CONTEXT_ADMIN_KEY: 'test-admin-key',
      CONTEXT_SESSION_STALE_MINUTES: '45',
      IDEMPOTENCY_TTL_SECONDS: '3600',
      HEARTBEAT_INTERVAL_SECONDS: '600',
      HEARTBEAT_JITTER_SECONDS: '120',
    }
  })

  // ============================================================
  // POST /machines/register — register / upsert
  // ============================================================

  it('POST /machines/register: creates new machine, returns 201 with created=true', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, role: 'orchestrator', pubkey: 'ssh-ed25519 AAAA test' },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as RegisterResponse
    expect(json.created).toBe(true)
    expect(json.machine.id).toMatch(/^mach_/)
    expect(json.machine.hostname).toBe('test-mac23')
    expect(json.machine.tailscale_ip).toBe('100.64.1.1')
    expect(json.machine.role).toBe('orchestrator')
    expect(json.machine.status).toBe('active')
    expect(json.machine.pubkey).toBe('ssh-ed25519 AAAA test')
    expect(json.correlation_id).toBeDefined()

    // Verify DB side effect
    const row = await db
      .prepare('SELECT * FROM machines WHERE id = ?')
      .bind(json.machine.id)
      .first<MachineRecord>()
    expect(row).not.toBeNull()
    expect(row!.hostname).toBe('test-mac23')
  })

  it('POST /machines/register: upserts existing machine by hostname, returns 200 with created=false', async () => {
    // First registration
    const first = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: baseMachine,
      env,
    })
    const firstJson = (await first.json()) as RegisterResponse
    const machineId = firstJson.machine.id

    // Second registration with same hostname, updated IP
    const second = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, tailscale_ip: '100.64.1.2' },
      env,
    })

    expect(second.status).toBe(200)
    const secondJson = (await second.json()) as RegisterResponse
    expect(secondJson.created).toBe(false)
    expect(secondJson.machine.id).toBe(machineId)
    expect(secondJson.machine.tailscale_ip).toBe('100.64.1.2')

    // Only one record in DB
    const countRow = await db
      .prepare('SELECT COUNT(*) as c FROM machines WHERE hostname = ?')
      .bind('test-mac23')
      .first<{ c: number }>()
    expect(countRow!.c).toBe(1)
  })

  it('POST /machines/register: creates machine with default role=dev when role omitted', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: baseMachine,
      env,
    })
    const json = (await res.json()) as RegisterResponse
    expect(json.machine.role).toBe('dev')
  })

  it('POST /machines/register: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers: {},
      body: baseMachine,
      env,
    })
    expect(res.status).toBe(401)
  })

  it('POST /machines/register: missing required field returns 400', async () => {
    const { hostname: _omitted, ...incomplete } = baseMachine
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: incomplete,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('POST /machines/register: all required fields must be strings — number fails 400', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 123 },
      env,
    })
    expect(res.status).toBe(400)
  })

  // ============================================================
  // GET /machines — list
  // ============================================================

  it('GET /machines: returns empty list when no machines registered', async () => {
    const res = await invoke(worker, { method: 'GET', path: '/machines', headers, env })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ListMachinesResponse
    expect(json.machines).toHaveLength(0)
    expect(json.count).toBe(0)
  })

  it('GET /machines: lists all active machines', async () => {
    await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 'alpha' },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 'beta' },
      env,
    })

    const res = await invoke(worker, { method: 'GET', path: '/machines', headers, env })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ListMachinesResponse
    expect(json.machines).toHaveLength(2)
    expect(json.count).toBe(2)
    // Sorted by hostname ascending
    expect(json.machines[0].hostname).toBe('alpha')
    expect(json.machines[1].hostname).toBe('beta')
  })

  it('GET /machines: missing auth returns 401', async () => {
    const res = await invoke(worker, { method: 'GET', path: '/machines', headers: {}, env })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // POST /machines/:id/heartbeat — update last_seen_at
  // ============================================================

  it('POST /machines/:id/heartbeat: updates last_seen_at and returns machine summary', async () => {
    const regRes = await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: baseMachine,
      env,
    })
    const { machine } = (await regRes.json()) as RegisterResponse
    const originalLastSeen = machine.last_seen_at

    // Brief pause to ensure the timestamp will differ
    await new Promise((r) => setTimeout(r, 10))

    const hbRes = await invoke(worker, {
      method: 'POST',
      path: `/machines/${machine.id}/heartbeat`,
      headers,
      body: {},
      env,
    })
    expect(hbRes.status).toBe(200)
    const json = (await hbRes.json()) as {
      id: string
      hostname: string
      last_seen_at: string
      correlation_id: string
    }
    expect(json.id).toBe(machine.id)
    expect(json.hostname).toBe(machine.hostname)
    expect(json.last_seen_at).toBeDefined()
    expect(json.correlation_id).toBeDefined()

    // Verify DB side effect: last_seen_at must have changed
    const row = await db
      .prepare('SELECT last_seen_at FROM machines WHERE id = ?')
      .bind(machine.id)
      .first<{ last_seen_at: string }>()
    expect(row!.last_seen_at).not.toBe(originalLastSeen)
  })

  it('POST /machines/:id/heartbeat: returns 404 for unknown machine id', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/mach_0000000000000000000000000/heartbeat',
      headers,
      body: {},
      env,
    })
    expect(res.status).toBe(404)
  })

  it('POST /machines/:id/heartbeat: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/machines/mach_anything/heartbeat',
      headers: {},
      body: {},
      env,
    })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // GET /machines/ssh-mesh-config — generate SSH config
  // ============================================================

  it('GET /machines/ssh-mesh-config: generates config excluding the requesting machine', async () => {
    // Register two machines
    await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 'mac23', tailscale_ip: '100.64.0.1' },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 'mini', tailscale_ip: '100.64.0.2' },
      env,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/machines/ssh-mesh-config?for=mac23',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      config: string
      machine_count: number
      generated_for: string
      correlation_id: string
    }
    expect(json.machine_count).toBe(1)
    expect(json.generated_for).toBe('mac23')
    expect(json.config).toContain('Host mini')
    expect(json.config).toContain('100.64.0.2')
    expect(json.config).not.toContain('Host mac23')
  })

  it('GET /machines/ssh-mesh-config: returns empty config with machine_count=0 when no peers', async () => {
    await invoke(worker, {
      method: 'POST',
      path: '/machines/register',
      headers,
      body: { ...baseMachine, hostname: 'solo-machine' },
      env,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/machines/ssh-mesh-config?for=solo-machine',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { machine_count: number }
    expect(json.machine_count).toBe(0)
  })

  it('GET /machines/ssh-mesh-config: missing ?for param returns 400', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/machines/ssh-mesh-config',
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('GET /machines/ssh-mesh-config: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/machines/ssh-mesh-config?for=anything',
      headers: {},
      env,
    })
    expect(res.status).toBe(401)
  })
})

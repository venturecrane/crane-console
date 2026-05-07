export interface MachineRecord {
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

export interface RegisterMachineRequest {
  hostname: string
  tailscale_ip: string
  user: string
  os: string
  arch: string
  pubkey?: string
  role?: string
  meta?: Record<string, unknown>
}

export interface RegisterMachineResponse {
  machine: MachineRecord
  created: boolean
}

export interface ListMachinesResponse {
  machines: MachineRecord[]
  count: number
}

export interface MachineHeartbeatResponse {
  id: string
  hostname: string
  last_seen_at: string
}

export interface SshMeshConfigResponse {
  config: string
  machine_count: number
  generated_for: string
}

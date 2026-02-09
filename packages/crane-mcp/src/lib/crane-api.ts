/**
 * Crane Context API client
 */

const API_BASE = "https://crane-context.automation-ab6.workers.dev";

export interface Venture {
  code: string;
  name: string;
  org: string;
}

export interface VenturesResponse {
  ventures: Venture[];
}

export interface Session {
  id: string;
  status: string;
  venture: string;
  repo: string;
  created_at: string;
}

export interface ActiveSession {
  agent: string;
  repo: string;
  track?: number;
  issue_number?: number;
  created_at: string;
}

export interface DocAuditMissing {
  doc_name: string;
  required: boolean;
  description: string | null;
  auto_generate: boolean;
  generation_sources: string[];
}

export interface DocAuditStale {
  doc_name: string;
  scope: string;
  version: number;
  updated_at: string;
  days_since_update: number;
  staleness_threshold_days: number;
  auto_generate: boolean;
  generation_sources: string[];
}

export interface DocAuditPresent {
  doc_name: string;
  scope: string;
  version: number;
  updated_at: string;
}

export interface DocAuditResult {
  venture: string;
  venture_name: string;
  status: "complete" | "incomplete" | "warning";
  missing: DocAuditMissing[];
  stale: DocAuditStale[];
  present: DocAuditPresent[];
  summary: string;
}

export interface SodResponse {
  session: Session;
  last_handoff?: {
    summary: string;
    from_agent: string;
    created_at: string;
    status_label: string;
  };
  active_sessions?: ActiveSession[];
  doc_audit?: DocAuditResult;
}

export interface UploadDocRequest {
  scope: string;
  doc_name: string;
  content: string;
  title?: string;
  description?: string;
  source_repo?: string;
  source_path?: string;
  uploaded_by?: string;
}

export interface UploadDocResponse {
  success: boolean;
  scope: string;
  doc_name: string;
  version: number;
  content_hash: string;
  content_size_bytes: number;
  created: boolean;
}

export interface HandoffRequest {
  venture: string;
  repo: string;
  agent: string;
  summary: string;
  status: "in_progress" | "blocked" | "done";
  issue_number?: number;
}

export interface Machine {
  id: string;
  hostname: string;
  tailscale_ip: string;
  user: string;
  os: string;
  arch: string;
  pubkey: string | null;
  role: string;
  status: string;
  registered_at: string;
  last_seen_at: string;
}

export interface RegisterMachineRequest {
  hostname: string;
  tailscale_ip: string;
  user: string;
  os: string;
  arch: string;
  pubkey?: string;
  role?: string;
  meta?: Record<string, unknown>;
}

export interface RegisterMachineResponse {
  machine: Machine;
  created: boolean;
}

export interface ListMachinesResponse {
  machines: Machine[];
  count: number;
}

export interface SshMeshConfigResponse {
  config: string;
  machine_count: number;
  generated_for: string;
}

// In-memory cache for session duration
let venturesCache: Venture[] | null = null;

export class CraneApi {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getVentures(): Promise<Venture[]> {
    // Return cached if available
    if (venturesCache) {
      return venturesCache;
    }

    const response = await fetch(`${API_BASE}/ventures`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = (await response.json()) as VenturesResponse;
    venturesCache = data.ventures;
    return data.ventures;
  }

  async startSession(params: {
    venture: string;
    repo: string;
    agent: string;
  }): Promise<SodResponse> {
    const response = await fetch(`${API_BASE}/sod`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Key": this.apiKey,
      },
      body: JSON.stringify({
        schema_version: "1.0",
        agent: params.agent,
        client: "crane-mcp",
        client_version: "0.1.0",
        host: getHostname(),
        venture: params.venture,
        repo: params.repo,
        track: 1,
        include_docs: false,
        docs_format: "index",
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return (await response.json()) as SodResponse;
  }

  async getDocAudit(venture?: string): Promise<{ audit?: DocAuditResult; audits?: DocAuditResult[] }> {
    const url = venture
      ? `${API_BASE}/docs/audit?venture=${encodeURIComponent(venture)}`
      : `${API_BASE}/docs/audit`;

    const response = await fetch(url, {
      headers: {
        "X-Relay-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return (await response.json()) as { audit?: DocAuditResult; audits?: DocAuditResult[] };
  }

  async uploadDoc(doc: UploadDocRequest): Promise<UploadDocResponse> {
    const adminKey = process.env.CRANE_ADMIN_KEY || this.apiKey;

    const response = await fetch(`${API_BASE}/admin/docs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
      body: JSON.stringify(doc),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    return (await response.json()) as UploadDocResponse;
  }

  async listMachines(): Promise<Machine[]> {
    const response = await fetch(`${API_BASE}/machines`, {
      headers: {
        "X-Relay-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as ListMachinesResponse;
    return data.machines;
  }

  async registerMachine(
    params: RegisterMachineRequest
  ): Promise<RegisterMachineResponse> {
    const response = await fetch(`${API_BASE}/machines/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Key": this.apiKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Register failed (${response.status}): ${text}`);
    }

    return (await response.json()) as RegisterMachineResponse;
  }

  async getSshMeshConfig(forHostname: string): Promise<SshMeshConfigResponse> {
    const response = await fetch(
      `${API_BASE}/machines/ssh-mesh-config?for=${encodeURIComponent(forHostname)}`,
      {
        headers: {
          "X-Relay-Key": this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return (await response.json()) as SshMeshConfigResponse;
  }

  async createHandoff(handoff: HandoffRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/eod`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Key": this.apiKey,
      },
      body: JSON.stringify({
        schema_version: "1.0",
        agent: handoff.agent,
        venture: handoff.venture,
        repo: handoff.repo,
        summary: handoff.summary,
        status_label: handoff.status,
        issue_number: handoff.issue_number,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
  }
}

function getHostname(): string {
  try {
    return process.env.HOSTNAME || require("os").hostname() || "unknown";
  } catch {
    return "unknown";
  }
}

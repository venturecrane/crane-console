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

export interface SodResponse {
  session: Session;
  last_handoff?: {
    summary: string;
    from_agent: string;
    created_at: string;
    status_label: string;
  };
  active_sessions?: ActiveSession[];
}

export interface HandoffRequest {
  venture: string;
  repo: string;
  agent: string;
  summary: string;
  status: "in_progress" | "blocked" | "done";
  issue_number?: number;
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

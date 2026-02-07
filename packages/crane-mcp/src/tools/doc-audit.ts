/**
 * crane_doc_audit tool - On-demand documentation audit
 *
 * Runs documentation audit for a venture or all ventures.
 * Optionally generates and uploads missing docs (fix mode).
 */

import { z } from "zod";
import { CraneApi, DocAuditResult } from "../lib/crane-api.js";
import { getCurrentRepoInfo, findVentureByOrg, scanLocalRepos } from "../lib/repo-scanner.js";
import { generateDoc } from "../lib/doc-generator.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

export const docAuditInputSchema = z.object({
  venture: z
    .string()
    .optional()
    .describe("Venture code to audit. If omitted, audits current venture."),
  all: z
    .boolean()
    .optional()
    .describe("Audit all ventures"),
  fix: z
    .boolean()
    .optional()
    .describe("Generate and upload missing docs"),
});

export type DocAuditInput = z.infer<typeof docAuditInputSchema>;

export interface DocAuditToolResult {
  status: "success" | "error";
  message: string;
}

function getApiKey(): string | null {
  return process.env.CRANE_CONTEXT_KEY || null;
}

export async function executeDocAudit(input: DocAuditInput): Promise<DocAuditToolResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: "error",
      message: "CRANE_CONTEXT_KEY not found. Start Claude with Infisical.",
    };
  }

  const api = new CraneApi(apiKey);

  try {
    // Determine venture(s) to audit
    let venture: string | undefined = input.venture;

    if (!venture && !input.all) {
      // Try to detect from current directory
      const currentRepo = getCurrentRepoInfo();
      if (currentRepo) {
        const ventures = await api.getVentures();
        const detected = findVentureByOrg(ventures, currentRepo.org);
        if (detected) {
          venture = detected.code;
        }
      }
    }

    if (input.all) {
      // Audit all ventures
      const result = await api.getDocAudit();
      if (!result.audits) {
        return { status: "error", message: "No audit results returned" };
      }

      let message = "## Documentation Audit — All Ventures\n\n";

      if (input.fix) {
        message += await fixAllVentures(api, result.audits);
      } else {
        message += formatAuditResults(result.audits);
      }

      return { status: "success", message };
    }

    if (!venture) {
      return {
        status: "error",
        message: "Could not detect venture. Provide venture parameter or run from a venture repo.",
      };
    }

    // Audit single venture
    const result = await api.getDocAudit(venture);
    if (!result.audit) {
      return { status: "error", message: "No audit result returned" };
    }

    let message = `## Documentation Audit — ${result.audit.venture_name}\n\n`;

    if (input.fix) {
      message += await fixSingleVenture(api, result.audit);
    } else {
      message += formatSingleAudit(result.audit);
    }

    return { status: "success", message };
  } catch (error) {
    return {
      status: "error",
      message: `Audit failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// Formatting
// ============================================================================

function formatAuditResults(audits: DocAuditResult[]): string {
  const lines: string[] = [];

  for (const audit of audits) {
    lines.push(`### ${audit.venture_name} (${audit.venture}) — ${audit.status}`);
    lines.push("");
    lines.push(formatSingleAudit(audit));
  }

  return lines.join("\n");
}

function formatSingleAudit(audit: DocAuditResult): string {
  const lines: string[] = [];

  if (audit.present.length > 0) {
    lines.push("**Present:**");
    for (const doc of audit.present) {
      lines.push(`- ${doc.doc_name} (v${doc.version}, updated ${doc.updated_at})`);
    }
    lines.push("");
  }

  if (audit.missing.length > 0) {
    lines.push("**Missing:**");
    for (const doc of audit.missing) {
      const tag = doc.required ? "[required]" : "[recommended]";
      const auto = doc.auto_generate ? " (auto-generable)" : "";
      lines.push(`- ${doc.doc_name} ${tag}${auto}`);
      if (doc.description) lines.push(`  ${doc.description}`);
    }
    lines.push("");
  }

  if (audit.stale.length > 0) {
    lines.push("**Stale:**");
    for (const doc of audit.stale) {
      lines.push(
        `- ${doc.doc_name} (${doc.days_since_update} days old, threshold: ${doc.staleness_threshold_days})`
      );
    }
    lines.push("");
  }

  lines.push(`Summary: ${audit.summary}`);
  return lines.join("\n");
}

// ============================================================================
// Fix Mode
// ============================================================================

async function fixSingleVenture(api: CraneApi, audit: DocAuditResult): Promise<string> {
  const lines: string[] = [formatSingleAudit(audit), ""];

  const repoPath = findRepoPath(audit.venture);
  if (!repoPath) {
    lines.push("Cannot auto-generate: repo not found locally.");
    return lines.join("\n");
  }

  const ventures = await api.getVentures();
  const ventureConfig = ventures.find(v => v.code === audit.venture);
  const ventureName = ventureConfig?.name || audit.venture_name;

  let generated = 0;
  let failed = 0;

  for (const doc of audit.missing) {
    if (!doc.auto_generate) continue;

    try {
      const result = generateDoc(
        doc.doc_name,
        audit.venture,
        ventureName,
        doc.generation_sources,
        repoPath
      );

      if (!result) {
        lines.push(`- ${doc.doc_name}: skipped (insufficient sources)`);
        failed++;
        continue;
      }

      await api.uploadDoc({
        scope: audit.venture,
        doc_name: doc.doc_name,
        content: result.content,
        title: result.title,
        source_repo: `${audit.venture}-console`,
        uploaded_by: "crane-mcp-autogen",
      });

      lines.push(`- ${doc.doc_name}: generated and uploaded`);
      generated++;
    } catch (error) {
      lines.push(`- ${doc.doc_name}: failed (${error instanceof Error ? error.message : "unknown"})`);
      failed++;
    }
  }

  lines.push("");
  lines.push(`Generated: ${generated}, Failed: ${failed}`);
  return lines.join("\n");
}

async function fixAllVentures(api: CraneApi, audits: DocAuditResult[]): Promise<string> {
  const lines: string[] = [];

  for (const audit of audits) {
    if (audit.status === "complete") {
      lines.push(`### ${audit.venture_name} — complete (no action needed)\n`);
      continue;
    }

    lines.push(`### ${audit.venture_name}\n`);
    lines.push(await fixSingleVenture(api, audit));
    lines.push("");
  }

  return lines.join("\n");
}

function findRepoPath(venture: string): string | null {
  // Check if we're already in the venture repo
  const cwd = process.cwd();
  const currentRepo = getCurrentRepoInfo();
  if (currentRepo) {
    // Check if cwd matches venture
    const cwdLower = cwd.toLowerCase();
    if (cwdLower.includes(venture)) {
      return cwd;
    }
  }

  // Scan ~/dev for the venture repo
  const localRepos = scanLocalRepos();
  for (const repo of localRepos) {
    if (repo.org.toLowerCase().includes(venture) || repo.name.toLowerCase().includes(venture)) {
      return repo.path;
    }
  }

  // Common path pattern
  const commonPath = join(homedir(), "dev", `${venture}-console`);
  if (existsSync(commonPath)) {
    return commonPath;
  }

  return null;
}

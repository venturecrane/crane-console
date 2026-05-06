import { skillAuditInputSchema, executeSkillAudit } from '../tools/skill-audit.js'
import {
  skillInvokeInputSchema,
  executeSkillInvoke,
  skillUsageInputSchema,
  executeSkillUsage,
} from '../tools/skill-invoke.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const SKILL_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_skill_audit',
      description:
        'Monthly skill staleness report. Walks every SKILL.md, parses frontmatter, computes staleness via git log, detects schema gaps, and emits a structured report.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['enterprise', 'global', 'all'],
            description: 'Which skills to audit. Default: all.',
          },
          stale_threshold_days: {
            type: 'number',
            description:
              'Days without a git touch before a skill is considered stale. Default: 180.',
          },
          include_deprecated: {
            type: 'boolean',
            description:
              'Include deprecated skills in staleness and inventory counts. Default: true.',
          },
        },
      },
    },
    skillAuditInputSchema,
    executeSkillAudit,
    true
  ),
  makeEntry(
    {
      name: 'crane_skill_invoked',
      description:
        'Record a skill invocation to telemetry. SKILL.md files call this as their first action. Best-effort: never throws.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'Name of the skill being invoked (e.g., "sos", "eos", "commit")',
          },
          session_id: {
            type: 'string',
            description: 'Current session ID if known',
          },
          status: {
            type: 'string',
            enum: ['started', 'completed', 'failed'],
            description: 'Invocation status. Default: started.',
          },
          duration_ms: {
            type: 'number',
            description: 'Elapsed time in milliseconds (set when reporting completion or failure)',
          },
          error_message: {
            type: 'string',
            description: 'Error detail (set on failure status)',
          },
        },
        required: ['skill_name'],
      },
    },
    skillInvokeInputSchema,
    executeSkillInvoke,
    false
  ),
  makeEntry(
    {
      name: 'crane_skill_usage',
      description:
        'Query aggregate skill invocation counts. Used by /skill-audit to flag zero-usage skills for deprecation.',
      inputSchema: {
        type: 'object',
        properties: {
          since: {
            type: 'string',
            description:
              'Lookback window: ISO date string or relative like "30d" / "90d". Default: 30d.',
          },
          skill_name: {
            type: 'string',
            description: 'Filter to a single skill name. Omit to see all skills.',
          },
        },
      },
    },
    skillUsageInputSchema,
    executeSkillUsage,
    true
  ),
]

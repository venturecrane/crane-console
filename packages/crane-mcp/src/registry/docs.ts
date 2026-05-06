import { docAuditInputSchema, executeDocAudit } from '../tools/doc-audit.js'
import { docInputSchema, executeDoc } from '../tools/doc.js'
import { docsDriftAuditInputSchema, executeDocsDriftAudit } from '../tools/docs-drift-audit.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const DOC_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_doc_audit',
      description: 'Audit venture documentation. Use fix=true to auto-generate.',
      inputSchema: {
        type: 'object',
        properties: {
          venture: {
            type: 'string',
            description: 'Venture code to audit. If omitted, detects from current repo.',
          },
          all: {
            type: 'boolean',
            description: 'Audit all ventures',
          },
          fix: {
            type: 'boolean',
            description: 'Generate and upload missing docs',
          },
        },
      },
    },
    docAuditInputSchema,
    executeDocAudit,
    true
  ),
  makeEntry(
    {
      name: 'crane_doc',
      description: 'Fetch a doc by scope and name.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description: 'Document scope: "global" or venture code',
          },
          doc_name: {
            type: 'string',
            description: 'Document name',
          },
          max_chars: {
            type: 'number',
            description: 'Maximum characters to return. Truncates with a note if exceeded.',
          },
          summary_only: {
            type: 'boolean',
            description:
              'Return only title, scope, version, and character count - not full content.',
          },
        },
        required: ['scope', 'doc_name'],
      },
    },
    docInputSchema,
    executeDoc,
    true
  ),
  makeEntry(
    {
      name: 'crane_docs_drift_audit',
      description:
        'Drift detection across the docs/ tree. Six checks: dead internal links, broken crane_doc references, deprecated-skill mentions, stale-by-git, sidebar drift, captain-review candidates. Report-only; no auto-fix.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description:
              'Limit walk to one site-published subdir under docs/ (e.g., "runbooks"). Default: all.',
          },
          stale_threshold_days: {
            type: 'number',
            description: 'Days without a git touch before a doc is flagged as stale. Default: 180.',
          },
          severity_filter: {
            type: 'string',
            enum: ['error', 'warn', 'info', 'all'],
            description: 'Restrict findings to this severity level or higher. Default: all.',
          },
        },
      },
    },
    docsDriftAuditInputSchema,
    executeDocsDriftAudit,
    true
  ),
]

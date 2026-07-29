/**
 * Advertised-vs-implemented schema parity for the local crane-mcp tool surface.
 *
 * Why this exists (2026-07-28). `crane_handoff` implemented `final`,
 * `override_pr_merge_gate`, and `override_verify_coverage_gate` in its zod
 * schema, and TOOL_SCHEMAS advertised none of them. `final` shipped in #752 to
 * make multi-venture /eos work; the advertised schema was never updated, so no
 * agent could see the parameter and every cross-venture /eos failed with a 409
 * on its second handoff. Worse, the PR-merge and verify-coverage gates print
 * "Pass override_..._gate=true if the gate is producing a false positive" —
 * instructions an agent cannot follow for a parameter absent from the schema it
 * was served.
 *
 * The defect class is built-not-wired: the code works, and the contract that
 * tells callers it exists does not mention it. Nothing anywhere compared the
 * two. check-hosted-mcp-parity.ts compares the HOSTED surface's three sources
 * by tool NAME and is a different check with a different job; it never looks at
 * the local surface and never looks at properties.
 *
 * What this pins:
 *   1. SCHEMA_BY_TOOL covers exactly the advertised tools (no tool escapes the
 *      check by being added to TOOL_SCHEMAS and forgotten here)
 *   2. per tool, advertised property names == zod shape keys
 *   3. per tool, advertised `required` == zod's non-optional keys
 *
 * Adding a tool parameter now means touching the zod schema and TOOL_SCHEMAS in
 * the same change, which is the whole point.
 */
import { describe, it, expect } from 'vitest'
import type { ZodTypeAny } from 'zod'

import { TOOL_SCHEMAS } from './tool-schemas.js'

import { claimOriginInputSchema, verifyInputSchema } from '../tools/verify.js'
import { contextInputSchema } from '../tools/context.js'
import { deployHeartbeatInputSchema } from '../tools/deploy-heartbeat.js'
import { docAuditInputSchema } from '../tools/doc-audit.js'
import { docInputSchema } from '../tools/doc.js'
import { docsDriftAuditInputSchema } from '../tools/docs-drift-audit.js'
import { fleetDispatchInputSchema } from '../tools/fleet-dispatch.js'
import { fleetStatusInputSchema } from '../tools/fleet-status.js'
import { handoffInputSchema } from '../tools/handoff.js'
import { memoryAuditInputSchema } from '../tools/memory-audit.js'
import { memoryInputSchema } from '../tools/memory.js'
import { memoryInvokeInputSchema, memoryUsageInputSchema } from '../tools/memory-invoke.js'
import { noteInputSchema, notesInputSchema } from '../tools/notes.js'
import { notificationsInputSchema, notificationUpdateInputSchema } from '../tools/notifications.js'
import { preflightInputSchema } from '../tools/preflight.js'
import { scheduleInputSchema } from '../tools/schedule.js'
import { secretCheckInputSchema } from '../tools/secret-check.js'
import { secretSetInputSchema } from '../tools/secret-set.js'
import { skillAuditInputSchema } from '../tools/skill-audit.js'
import { skillInvokeInputSchema, skillUsageInputSchema } from '../tools/skill-invoke.js'
import { sosInputSchema } from '../tools/sos.js'
import { statusInputSchema } from '../tools/status.js'
import { venturesInputSchema } from '../tools/ventures.js'
import { verifyAuditInputSchema } from '../tools/verify-audit.js'
import { worktreeDoctorInputSchema } from '../tools/worktree-doctor.js'

/**
 * Tool name to the zod schema `dispatch.ts` actually parses its args with.
 *
 * Authored by hand because HANDLERS uses inline arrow functions and exposes no
 * name-to-schema map to iterate. The first assertion below pins this map's key
 * set to TOOL_SCHEMAS, so a new tool cannot quietly skip the parity check: it
 * fails here until it is registered.
 */
const SCHEMA_BY_TOOL: Record<string, ZodTypeAny> = {
  crane_claim_origin: claimOriginInputSchema,
  crane_context: contextInputSchema,
  crane_deploy_heartbeat: deployHeartbeatInputSchema,
  crane_doc: docInputSchema,
  crane_doc_audit: docAuditInputSchema,
  crane_docs_drift_audit: docsDriftAuditInputSchema,
  crane_fleet_dispatch: fleetDispatchInputSchema,
  crane_fleet_status: fleetStatusInputSchema,
  crane_handoff: handoffInputSchema,
  crane_memory: memoryInputSchema,
  crane_memory_audit: memoryAuditInputSchema,
  crane_memory_invoked: memoryInvokeInputSchema,
  crane_memory_usage: memoryUsageInputSchema,
  crane_note: noteInputSchema,
  crane_notes: notesInputSchema,
  crane_notification_update: notificationUpdateInputSchema,
  crane_notifications: notificationsInputSchema,
  crane_preflight: preflightInputSchema,
  crane_schedule: scheduleInputSchema,
  crane_secret_check: secretCheckInputSchema,
  crane_secret_set: secretSetInputSchema,
  crane_skill_audit: skillAuditInputSchema,
  crane_skill_invoked: skillInvokeInputSchema,
  crane_skill_usage: skillUsageInputSchema,
  crane_sos: sosInputSchema,
  crane_status: statusInputSchema,
  crane_ventures: venturesInputSchema,
  crane_verify: verifyInputSchema,
  crane_verify_audit: verifyAuditInputSchema,
  crane_worktree_doctor: worktreeDoctorInputSchema,
}

interface AdvertisedSchema {
  name: string
  inputSchema: {
    properties?: Record<string, unknown>
    required?: readonly string[]
  }
}

const advertised = TOOL_SCHEMAS as unknown as readonly AdvertisedSchema[]

/**
 * Resolve a zod schema to the list of object shapes a caller could satisfy.
 *
 * One entry for a plain `z.object()`. N entries for a discriminated union
 * (crane_memory), one per branch. `.shape` sits one level down on schemas
 * wrapped by `.superRefine()` / `.refine()` (crane_verify), under a key that has
 * moved across zod versions, so walk the known wrapper keys rather than pinning
 * to one. Returns null when nothing can be resolved, which the assertions
 * surface as an explicit failure rather than an empty pass.
 */
function resolveShapes(schema: unknown): Record<string, unknown>[] | null {
  const s = schema as Record<string, unknown> | null
  if (!s || typeof s !== 'object') return null

  if ('shape' in s && s.shape && typeof s.shape === 'object') {
    return [s.shape as Record<string, unknown>]
  }

  const def = (s.def ?? s._def) as Record<string, unknown> | undefined
  if (!def) return null

  const options = (s.options ?? def.options) as unknown[] | undefined
  if (Array.isArray(options) && options.length > 0) {
    const shapes = options.flatMap((o) => resolveShapes(o) ?? [])
    return shapes.length === options.length ? shapes : null
  }

  for (const key of ['innerType', 'schema', 'in']) {
    if (def[key]) {
      const inner = resolveShapes(def[key])
      if (inner) return inner
    }
  }
  return null
}

/** Every field name a caller could legitimately send, across all branches. */
function allKeys(shapes: Record<string, unknown>[]): string[] {
  return [...new Set(shapes.flatMap((s) => Object.keys(s)))]
}

/** Field names one zod object treats as required (i.e. not `.optional()`). */
function requiredIn(shape: Record<string, unknown>): string[] {
  return Object.entries(shape)
    .filter(([, field]) => {
      const f = field as { safeParse?: (v: unknown) => { success: boolean } }
      // A field is optional iff it accepts `undefined`. Cheaper and far more
      // version-stable than reading zod's internal type tags.
      return typeof f?.safeParse === 'function' ? !f.safeParse(undefined).success : true
    })
    .map(([name]) => name)
}

/**
 * Fields the advertised schema may honestly mark required.
 *
 * For a union that is the INTERSECTION across branches, not the union: a field
 * required only by `action: "save"` is not required of every caller, and
 * advertising it as such would reject valid `action: "list"` calls at the
 * client before they were ever sent. Per-branch requirements belong in the
 * field descriptions, which is where the generated `(actions: ...)` notes go.
 */
function requiredEverywhere(shapes: Record<string, unknown>[]): string[] {
  const perShape = shapes.map((s) => new Set(requiredIn(s)))
  return [...perShape[0]].filter((k) => perShape.every((set) => set.has(k)))
}

describe('tool surface: the parity map is complete', () => {
  it('covers exactly the advertised tools', () => {
    const advertisedNames = advertised.map((t) => t.name).sort()
    const mapped = Object.keys(SCHEMA_BY_TOOL).sort()
    expect(
      mapped,
      'SCHEMA_BY_TOOL must list every tool in TOOL_SCHEMAS and nothing else. ' +
        'A new tool added to TOOL_SCHEMAS must be registered here so it is parity-checked.'
    ).toEqual(advertisedNames)
  })

  it('finds tools at all (sanity: an emptied registry must not pass green)', () => {
    expect(advertised.length).toBeGreaterThanOrEqual(30)
  })

  it('resolves a shape for every mapped schema', () => {
    const unresolved = Object.entries(SCHEMA_BY_TOOL)
      .filter(([, schema]) => resolveShapes(schema) === null)
      .map(([name]) => name)
    expect(
      unresolved,
      'resolveShapes() could not reach these schemas; the parity assertions below ' +
        'would silently pass on them. Teach resolveShapes the new wrapper shape.'
    ).toEqual([])
  })
})

describe('tool surface: advertised schema matches implemented schema', () => {
  for (const tool of advertised) {
    const schema = SCHEMA_BY_TOOL[tool.name]
    if (!schema) continue // covered by the completeness test above

    it(`${tool.name}: advertised properties match the zod shape`, () => {
      const shapes = resolveShapes(schema)
      expect(shapes).not.toBeNull()

      const implemented = allKeys(shapes!).sort()
      const declared = Object.keys(tool.inputSchema.properties ?? {}).sort()

      const unadvertised = implemented.filter((k) => !declared.includes(k))
      const phantom = declared.filter((k) => !implemented.includes(k))

      expect(
        { unadvertised, phantom },
        `${tool.name} schema drift.\n` +
          `  unadvertised (implemented, invisible to callers): ${unadvertised.join(', ') || '(none)'}\n` +
          `  phantom (advertised, not implemented): ${phantom.join(', ') || '(none)'}\n` +
          `Fix both sides in the same change.`
      ).toEqual({ unadvertised: [], phantom: [] })
    })

    it(`${tool.name}: advertised required list matches the zod shape`, () => {
      const shapes = resolveShapes(schema)
      const implementedRequired = requiredEverywhere(shapes!).sort()
      const declaredRequired = [...(tool.inputSchema.required ?? [])].sort()

      expect(
        declaredRequired,
        `${tool.name} required-field drift. Advertising a field as optional when zod ` +
          `requires it produces a runtime parse error the caller could not have predicted; ` +
          `the reverse makes callers send fields they need not.`
      ).toEqual(implementedRequired)
    })
  }
})

/**
 * MCP tool dispatch — routes CallTool requests to the appropriate execute* function
 * via a handler map. No switch needed; complexity stays at 1 regardless of tool count.
 */

import { sosInputSchema, executeSos } from '../tools/sos.js'
import { venturesInputSchema, executeVentures } from '../tools/ventures.js'
import { contextInputSchema, executeContext } from '../tools/context.js'
import { handoffInputSchema, executeHandoff } from '../tools/handoff.js'
import { preflightInputSchema, executePreflight } from '../tools/preflight.js'
import { statusInputSchema, executeStatus } from '../tools/status.js'
import { docAuditInputSchema, executeDocAudit } from '../tools/doc-audit.js'
import { noteInputSchema, executeNote } from '../tools/notes.js'
import { notesInputSchema, executeNotes } from '../tools/notes.js'
import { docInputSchema, executeDoc } from '../tools/doc.js'
import { scheduleInputSchema, executeSchedule } from '../tools/schedule.js'
import { fleetDispatchInputSchema, executeFleetDispatch } from '../tools/fleet-dispatch.js'
import { fleetStatusInputSchema, executeFleetStatus } from '../tools/fleet-status.js'
import {
  notificationsInputSchema,
  executeNotifications,
  notificationUpdateInputSchema,
  executeNotificationUpdate,
} from '../tools/notifications.js'
import { deployHeartbeatInputSchema, executeDeployHeartbeat } from '../tools/deploy-heartbeat.js'
import { skillAuditInputSchema, executeSkillAudit } from '../tools/skill-audit.js'
import {
  skillInvokeInputSchema,
  executeSkillInvoke,
  skillUsageInputSchema,
  executeSkillUsage,
} from '../tools/skill-invoke.js'
import { memoryInputSchema, executeMemory } from '../tools/memory.js'
import {
  memoryInvokeInputSchema,
  executeMemoryInvoke,
  memoryUsageInputSchema,
  executeMemoryUsage,
} from '../tools/memory-invoke.js'
import { memoryAuditInputSchema, executeMemoryAudit } from '../tools/memory-audit.js'
import { docsDriftAuditInputSchema, executeDocsDriftAudit } from '../tools/docs-drift-audit.js'
import { worktreeDoctorInputSchema, executeWorktreeDoctor } from '../tools/worktree-doctor.js'
import {
  verifyInputSchema,
  executeVerify,
  claimOriginInputSchema,
  executeClaimOrigin,
} from '../tools/verify.js'
import { verifyAuditInputSchema, executeVerifyAudit } from '../tools/verify-audit.js'
import { secretCheckInputSchema, executeSecretCheck } from '../tools/secret-check.js'
import { secretSetInputSchema, executeSecretSet } from '../tools/secret-set.js'

export type ToolResult = {
  isError?: true
  content: Array<{ type: string; text: string }>
}

type Handler = (args: unknown) => Promise<ToolResult>

function text(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }] }
}

/** Map of tool name → async handler. Add entries here when registering new tools. */
const HANDLERS: Record<string, Handler> = {
  crane_preflight: async (args) => {
    const result = await executePreflight(preflightInputSchema.parse(args))
    return text(result.message)
  },
  crane_sos: async (args) => {
    const result = await executeSos(sosInputSchema.parse(args))
    return text(result.message)
  },
  crane_status: async (args) => {
    const result = await executeStatus(statusInputSchema.parse(args))
    return text(result.message)
  },
  crane_ventures: async (args) => {
    const result = await executeVentures(venturesInputSchema.parse(args))
    return text(result.message)
  },
  crane_context: async (args) => {
    const result = await executeContext(contextInputSchema.parse(args))
    return text(result.message)
  },
  crane_doc_audit: async (args) => {
    const result = await executeDocAudit(docAuditInputSchema.parse(args))
    return text(result.message)
  },
  crane_doc: async (args) => {
    const result = await executeDoc(docInputSchema.parse(args))
    return text(result.message)
  },
  crane_handoff: async (args) => {
    const result = await executeHandoff(handoffInputSchema.parse(args))
    return text(result.message)
  },
  crane_note: async (args) => {
    const result = await executeNote(noteInputSchema.parse(args))
    return text(result.message)
  },
  crane_notes: async (args) => {
    const result = await executeNotes(notesInputSchema.parse(args))
    return text(result.message)
  },
  crane_schedule: async (args) => {
    const result = await executeSchedule(scheduleInputSchema.parse(args))
    return text(result.message)
  },
  crane_fleet_dispatch: async (args) => {
    const result = await executeFleetDispatch(fleetDispatchInputSchema.parse(args))
    return text(result.message)
  },
  crane_fleet_status: async (args) => {
    const result = await executeFleetStatus(fleetStatusInputSchema.parse(args))
    return text(result.message)
  },
  crane_notifications: async (args) => {
    const result = await executeNotifications(notificationsInputSchema.parse(args))
    return text(result.message)
  },
  crane_notification_update: async (args) => {
    const result = await executeNotificationUpdate(notificationUpdateInputSchema.parse(args))
    return text(result.message)
  },
  crane_deploy_heartbeat: async (args) => {
    const result = await executeDeployHeartbeat(deployHeartbeatInputSchema.parse(args))
    return text(result.message)
  },
  crane_skill_audit: async (args) => {
    const result = await executeSkillAudit(skillAuditInputSchema.parse(args))
    return text(result.message)
  },
  crane_skill_invoked: async (args) => {
    const result = await executeSkillInvoke(skillInvokeInputSchema.parse(args))
    return text(result.message)
  },
  crane_skill_usage: async (args) => {
    const result = await executeSkillUsage(skillUsageInputSchema.parse(args))
    return text(result.message)
  },
  crane_memory: async (args) => {
    const result = await executeMemory(memoryInputSchema.parse(args))
    return text(result.message)
  },
  crane_memory_invoked: async (args) => {
    const result = await executeMemoryInvoke(memoryInvokeInputSchema.parse(args))
    return text(result.message)
  },
  crane_memory_usage: async (args) => {
    const result = await executeMemoryUsage(memoryUsageInputSchema.parse(args))
    return text(result.message)
  },
  crane_memory_audit: async (args) => {
    const result = await executeMemoryAudit(memoryAuditInputSchema.parse(args))
    return text(result.message)
  },
  crane_docs_drift_audit: async (args) => {
    const result = await executeDocsDriftAudit(docsDriftAuditInputSchema.parse(args))
    return text(result.message)
  },
  crane_worktree_doctor: async (args) => {
    const result = await executeWorktreeDoctor(worktreeDoctorInputSchema.parse(args))
    return text(result.message)
  },
  crane_verify: async (args) => {
    const result = await executeVerify(verifyInputSchema.parse(args))
    return text(result.message)
  },
  crane_claim_origin: async (args) => {
    const result = await executeClaimOrigin(claimOriginInputSchema.parse(args))
    return text(result.message)
  },
  crane_verify_audit: async (args) => {
    const result = await executeVerifyAudit(verifyAuditInputSchema.parse(args))
    return text(result.message)
  },
  crane_secret_check: async (args) => {
    const result = await executeSecretCheck(secretCheckInputSchema.parse(args))
    return text(result.message)
  },
  crane_secret_set: async (args) => {
    const result = await executeSecretSet(secretSetInputSchema.parse(args))
    return text(result.message)
  },
}

/** Dispatch a tool call by name. Returns the MCP result object. */
export async function dispatchTool(name: string, args: unknown): Promise<ToolResult> {
  const handler = HANDLERS[name]
  if (!handler) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
    }
  }
  return handler(args)
}

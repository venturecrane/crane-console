import { buildRegistry, type ToolEntry } from '../tool-runtime.js'

import { DOC_TOOLS } from './docs.js'
import { FLEET_TOOLS } from './fleet.js'
import { MEMORY_TOOLS } from './memory.js'
import { NOTE_TOOLS } from './notes.js'
import { NOTIFICATION_TOOLS } from './notifications.js'
import { SESSION_TOOLS } from './session.js'
import { SKILL_TOOLS } from './skills.js'
import { VERIFY_TOOLS } from './verify.js'

export const ALL_TOOLS: ToolEntry[] = [
  ...SESSION_TOOLS,
  ...DOC_TOOLS,
  ...NOTE_TOOLS,
  ...FLEET_TOOLS,
  ...NOTIFICATION_TOOLS,
  ...SKILL_TOOLS,
  ...MEMORY_TOOLS,
  ...VERIFY_TOOLS,
]

export const TOOL_REGISTRY = buildRegistry(ALL_TOOLS)

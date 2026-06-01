/**
 * MCP tool schema declarations — the `tools` array returned by ListTools.
 * Pure data: no logic, no imports. Grouped by domain; combined into TOOL_SCHEMAS.
 * Edit here when adding or changing a tool's name, description, or inputSchema.
 */

import { CORE_TOOL_SCHEMAS } from './tool-schemas-core.js'
import { SECRETS_TOOL_SCHEMAS } from './tool-schemas-secrets.js'
import { TELEMETRY_TOOL_SCHEMAS } from './tool-schemas-telemetry.js'

export const TOOL_SCHEMAS = [
  ...CORE_TOOL_SCHEMAS,
  ...SECRETS_TOOL_SCHEMAS,
  ...TELEMETRY_TOOL_SCHEMAS,
] as const

import type { ToolContext } from './types'
import { createPlanningTools } from './planning-tools'
import { createInspectionTools } from './inspection-tools'
import { createGenerationTools } from './generation-tools'
import { createModelTools } from './model-tools'
import { createSearchTools } from './search-tools'
import { createPersistenceTools } from './persistence-tools'
import { createMcpTools } from './mcp-tools'

/**
 * Composition root for utility tools.
 * Each domain has its own file for navigability:
 * - planning-tools.ts: think, present_plan, ask_user, checkpoint, suggest_improvement
 * - inspection-tools.ts: validate_file, check_coherence, diagnose_preview, capture_preview, search_references, get_reference_code
 * - generation-tools.ts: generate_tests, check_dependency_health
 * - model-tools.ts: select_model
 * - search-tools.ts: web_search
 * - persistence-tools.ts: save_memory, load_memory, save_preference, load_preferences, load_chat_history, request_env_vars
 * - mcp-tools.ts: mcp_list_servers, mcp_connect_server, mcp_call_tool
 */
export function createUtilityTools(ctx: ToolContext) {
  return {
    ...createPlanningTools(ctx),
    ...createInspectionTools(ctx),
    ...createGenerationTools(ctx),
    ...createModelTools(ctx),
    ...createSearchTools(ctx),
    ...createPersistenceTools(ctx),
    ...createMcpTools(ctx),
  }
}

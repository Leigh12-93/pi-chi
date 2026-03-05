import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

/** Terminal tools that execute commands via WebContainer (client-side).
 *  These tools return instructions that the client interprets to run on the WebContainer instance. */
export function createTerminalTools(ctx: ToolContext) {
  return {
    run_command: tool({
      description: 'Execute a shell command in the WebContainer terminal. Returns stdout/stderr. Use for: running scripts, checking versions, listing files, any CLI operation. Commands run in the project root directory.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute (e.g., "ls -la", "node script.js", "cat package.json")'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000, max: 120000)'),
      }),
      execute: async ({ command, timeout }) => {
        // Terminal tools are executed client-side via WebContainer.
        // We return a structured result that the client-side hook interprets.
        return {
          __terminal_action: 'run_command' as const,
          command,
          timeout: Math.min(timeout || 30000, 120000),
        }
      },
    }),

    install_package: tool({
      description: 'Install one or more npm packages. Runs npm install and captures output. Use this instead of run_command for package installation — it handles errors better.',
      inputSchema: z.object({
        packages: z.string().describe('Space-separated package names (e.g., "axios lodash" or "react-router-dom@latest")'),
        dev: z.boolean().optional().describe('Install as devDependency (--save-dev)'),
      }),
      execute: async ({ packages, dev }) => {
        return {
          __terminal_action: 'install_package' as const,
          packages,
          dev: dev || false,
        }
      },
    }),

    run_dev_server: tool({
      description: 'Start or restart the development server (npm run dev). Use when: server crashed, port conflict, after config changes, or after installing new packages that need a server restart.',
      inputSchema: z.object({
        script: z.string().optional().describe('Custom script name to run instead of "dev" (e.g., "start", "serve")'),
      }),
      execute: async ({ script }) => {
        return {
          __terminal_action: 'run_dev_server' as const,
          script: script || 'dev',
        }
      },
    }),
  }
}

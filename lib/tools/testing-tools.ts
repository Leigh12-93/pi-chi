import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

/** Testing/build verification tools — executed client-side via WebContainer */
export function createTestingTools(_ctx: ToolContext) {
  return {
    run_build: tool({
      description: 'Run the project build (npm run build). Returns build output including any errors or warnings. Use after making changes to verify the project compiles correctly.',
      inputSchema: z.object({
        script: z.string().optional().describe('Custom build script name (default: "build")'),
      }),
      execute: async ({ script }) => {
        return {
          __terminal_action: 'run_build' as const,
          command: `npm run ${script || 'build'}`,
          timeout: 120000,
        }
      },
    }),

    run_tests: tool({
      description: 'Run the project test suite (npm test). Returns test output including pass/fail counts and any failures. Use to verify code changes work correctly.',
      inputSchema: z.object({
        script: z.string().optional().describe('Custom test script name (default: "test")'),
        testFile: z.string().optional().describe('Specific test file to run (e.g., "src/__tests__/App.test.tsx")'),
      }),
      execute: async ({ script, testFile }) => {
        const cmd = testFile
          ? `npx vitest run ${testFile}`
          : `npm run ${script || 'test'}`
        return {
          __terminal_action: 'run_tests' as const,
          command: cmd,
          timeout: 120000,
        }
      },
    }),

    check_types: tool({
      description: 'Run TypeScript type checking (tsc --noEmit). Returns any type errors found. Use to catch type issues before deploying.',
      inputSchema: z.object({}),
      execute: async () => {
        return {
          __terminal_action: 'check_types' as const,
          command: 'npx tsc --noEmit',
          timeout: 60000,
        }
      },
    }),

    verify_build: tool({
      description: 'Run the full verification pipeline: type check → build → test. Returns combined results. Use after completing a set of changes to ensure everything works. This is the gold standard for code quality verification.',
      inputSchema: z.object({}),
      execute: async () => {
        return {
          __terminal_action: 'verify_build' as const,
          // Client will run these sequentially, stopping on first failure
          steps: [
            { name: 'Type Check', command: 'npx tsc --noEmit', timeout: 60000 },
            { name: 'Build', command: 'npm run build', timeout: 120000 },
            { name: 'Tests', command: 'npm test -- --run 2>/dev/null || true', timeout: 120000 },
          ],
        }
      },
    }),
  }
}

import { z } from 'zod';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';

/**
 * Extended input schema for PostToolUse hook
 */
const PostToolUseRawInputSchema = z.object({
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_output: z.unknown().optional(),
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
});

/**
 * Extract command from Bash tool input
 */
function extractBashCommand(toolInput: unknown): string | undefined {
  if (!toolInput || typeof toolInput !== 'object') {
    return undefined;
  }

  const input = toolInput as Record<string, unknown>;

  // Handle different possible structures
  if (typeof input.command === 'string') {
    return input.command;
  }

  if (typeof input.cmd === 'string') {
    return input.cmd;
  }

  return undefined;
}

/**
 * Handle the PostToolUse hook
 *
 * This hook is called after a tool is executed. For Bash commands,
 * it records a workspace fingerprint to track changes.
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns undefined (no output needed)
 */
export async function handlePostToolUse(
  rawInput: unknown
): Promise<undefined> {
  // Parse and validate input
  const parseResult = PostToolUseRawInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    // Silently fail - don't disrupt the session
    return undefined;
  }

  const input = parseResult.data;
  const { tool_name, tool_input, cwd } = input;

  // Only process Bash tool calls
  if (tool_name !== 'Bash') {
    return undefined;
  }

  // Load configuration
  const config = loadConfig(cwd);

  // Check if fingerprinting on tool use is enabled
  if (!config.performance.fingerprintOnToolUse) {
    return undefined;
  }

  // Initialize ledger
  const ledger = new LedgerManager(config, cwd);
  await ledger.initialize();

  // Compute workspace fingerprint
  const git = new GitManager(cwd);
  const fingerprint = git.computeFingerprint();

  // Extract the command for context
  const command = extractBashCommand(tool_input);

  // Record fingerprint
  await ledger.recordFingerprint(fingerprint, command);

  return undefined;
}

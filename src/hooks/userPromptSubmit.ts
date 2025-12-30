import { z } from 'zod';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';
import { DirectiveType, GitBaseline } from '../types/index.js';
import { expandSlashCommand, extractFileReferences } from '../utils/slashCommands.js';

/**
 * Extended input schema for UserPromptSubmit hook
 * Includes cwd since we need to know the project directory
 */
const UserPromptSubmitRawInputSchema = z.object({
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string(),
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
});

/**
 * Output schema for UserPromptSubmit hook
 * Can inject additional context into the conversation
 */
interface UserPromptSubmitOutput {
  additionalContext?: string;
}

/**
 * Determine the type of directive based on prompt content
 */
function determineDirectiveType(
  prompt: string,
  isFirstPrompt: boolean
): DirectiveType {
  const lowerPrompt = prompt.toLowerCase();

  if (isFirstPrompt) {
    return 'initial';
  }

  // Check for clarification (ends with question mark)
  if (prompt.trim().endsWith('?')) {
    return 'clarification';
  }

  // Check for correction patterns
  const correctionPatterns = [
    'actually',
    'instead',
    'forget',
    'no,',
    'wait,',
    'scratch that',
    'nevermind',
    'never mind',
    'disregard',
    'ignore that',
    'i meant',
    'correction:',
  ];

  for (const pattern of correctionPatterns) {
    if (lowerPrompt.includes(pattern)) {
      return 'followup'; // Using followup for corrections since our schema doesn't have 'correction'
    }
  }

  return 'followup';
}

/**
 * Handle the UserPromptSubmit hook
 *
 * This hook is called when a user submits a new prompt. It:
 * 1. Expands slash commands if present
 * 2. Records the directive in the task ledger
 * 3. Creates a git baseline on the first prompt
 * 4. Returns context injection about RealityCheck being active
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns Output with optional additionalContext
 */
export async function handleUserPromptSubmit(
  rawInput: unknown
): Promise<UserPromptSubmitOutput | undefined> {
  // Parse and validate input
  const parseResult = UserPromptSubmitRawInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    console.error('RealityCheck: Invalid UserPromptSubmit input');
    return undefined;
  }

  const input = parseResult.data;
  const { prompt, cwd } = input;

  // Load configuration
  const config = loadConfig(cwd);

  // Initialize ledger
  const ledger = new LedgerManager(config, cwd);
  await ledger.initialize();

  // Determine if this is the first prompt in the session
  const existingDirectives = ledger.getAllDirectives();
  const isFirstPrompt = existingDirectives.length === 0;

  // Process the prompt
  let processedPrompt = prompt;
  let expandedCommand = null;

  // Expand slash commands
  if (prompt.trim().startsWith('/')) {
    expandedCommand = await expandSlashCommand(prompt, cwd);
    if (expandedCommand) {
      processedPrompt = expandedCommand.expandedText;
    }
  }

  // Extract any file references for context (may be used for future features)
  extractFileReferences(processedPrompt, cwd);

  // Determine directive type
  const directiveType = determineDirectiveType(prompt, isFirstPrompt);

  // Record the directive
  await ledger.addDirective(
    processedPrompt,
    directiveType,
    expandedCommand?.summary
  );

  // On first prompt, create git baseline
  if (isFirstPrompt && config.git.enabled && config.git.captureBaseline) {
    const git = new GitManager(cwd);

    if (git.isGitRepo()) {
      const status = git.getStatus();

      if (status.isRepo && status.headCommit && status.branch) {
        const baseline: GitBaseline = {
          branch: status.branch,
          commitHash: status.headCommit,
          isDirty: status.dirtyFiles.length > 0 || status.untrackedFiles.length > 0,
          capturedAt: new Date().toISOString(),
        };

        await ledger.setBaseline(baseline);

        // Also record initial fingerprint
        const fingerprint = git.computeFingerprint();
        await ledger.recordFingerprint(fingerprint, 'initial');
      }
    }
  }

  // On first prompt, inject context about RealityCheck
  if (isFirstPrompt) {
    return {
      additionalContext: `[RealityCheck Active] This session is monitored by RealityCheck. When you complete the task and attempt to stop, a quality gate will verify that all user requirements have been met. Focus on fully completing the requested work before stopping.`,
    };
  }

  return undefined;
}

import { z } from 'zod';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';
import { HookDecision } from '../types/index.js';
import { readTranscript } from '../utils/transcript.js';
import { runJudge, JudgeVerdict } from '../judge/index.js';

/**
 * Extended input schema for Stop hook
 */
const StopHookRawInputSchema = z.object({
  hook_event_name: z.literal('Stop'),
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  stop_hook_active: z.boolean().optional().default(false),
});

/**
 * Format the block response with structured feedback
 */
function formatBlockReason(verdict: JudgeVerdict): string {
  let reason = `Task incomplete: ${verdict.reason}`;

  if (verdict.missingItems.length > 0) {
    reason += '\n\nMissing items:';
    for (const item of verdict.missingItems) {
      reason += `\n- ${item}`;
    }
  }

  if (verdict.suggestedNextSteps.length > 0) {
    reason += '\n\nSuggested next steps:';
    for (const step of verdict.suggestedNextSteps) {
      reason += `\n- ${step}`;
    }
  }

  if (verdict.questionsForUser.length > 0) {
    reason += '\n\nQuestions for user:';
    for (const question of verdict.questionsForUser) {
      reason += `\n- ${question}`;
    }
  }

  return reason;
}

/**
 * Handle the Stop hook - the main quality gate
 *
 * This hook is called when Claude attempts to complete/stop a task.
 * It evaluates whether all user requirements have been met and can
 * block the stop if the task is incomplete.
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns HookDecision to approve or block the stop
 */
export async function handleStop(
  rawInput: unknown
): Promise<HookDecision | undefined> {
  // Parse and validate input
  const parseResult = StopHookRawInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    console.error('RealityCheck: Invalid Stop input');
    // Fail open - allow stop if we can't parse input
    return { decision: 'approve' };
  }

  const input = parseResult.data;
  const { cwd, transcript_path, stop_hook_active } = input;

  // Load configuration
  const config = loadConfig(cwd);

  // Initialize ledger
  const ledger = new LedgerManager(config, cwd);
  await ledger.initialize();

  // Get active directives
  const activeDirectives = ledger.getActiveDirectives();

  // If no directives, nothing to validate - allow stop
  if (activeDirectives.length === 0) {
    return { decision: 'approve' };
  }

  // Check limits - if exceeded, allow stop with explanation
  const limitCheck = ledger.checkLimits();
  if (limitCheck.exceeded) {
    await ledger.recordStopAttempt({
      verdict: 'complete',
      reason: `Limits exceeded: ${limitCheck.reason}. Allowing stop to prevent infinite loop.`,
    });
    return { decision: 'approve' };
  }

  // Analyze progress - if stagnant, be more lenient
  const progressAnalysis = ledger.analyzeProgress();
  if (progressAnalysis.trend === 'stagnant' && progressAnalysis.consecutiveFailures >= config.limits.noProgressThreshold) {
    await ledger.recordStopAttempt({
      verdict: 'blocked',
      reason: progressAnalysis.recommendation || 'No progress detected after multiple attempts.',
    });

    return {
      decision: 'block',
      reason: `${progressAnalysis.recommendation || 'No progress detected.'} Consider asking the user for clarification or taking a different approach.`,
    };
  }

  // Guard against recursion - if stop_hook_active, be lenient
  if (stop_hook_active) {
    // This means the judge itself is trying to stop
    // Be more permissive to avoid infinite loops
    return { decision: 'approve' };
  }

  // Gather evidence for the judge
  const git = new GitManager(cwd);
  const currentFingerprint = git.computeFingerprint();
  const currentDiff = config.git.includeDiff ? git.getCurrentDiff() : null;

  // Read recent transcript for the judge
  const recentMessages = await readTranscript(transcript_path, { lastN: 20 });

  // Get the last assistant message for the judge
  const lastAssistantMessage = recentMessages
    .filter((m) => m.role === 'assistant')
    .pop();

  // Run the external judge to evaluate task completion
  const verdict = await runJudge({
    config,
    directives: activeDirectives,
    diff: currentDiff,
    fingerprint: currentFingerprint,
    lastMessage: lastAssistantMessage?.content,
    stopAttempts: ledger.getStopAttempts(),
    projectDir: cwd,
  });

  // Record the stop attempt
  await ledger.recordStopAttempt({
    verdict: verdict.pass ? 'complete' : 'incomplete',
    reason: verdict.reason,
    fingerprintBefore: ledger.getFingerprints().slice(-1)[0]?.hash,
    fingerprintAfter: currentFingerprint,
  });

  // Return decision
  if (verdict.pass) {
    // Mark directives as completed
    for (const directive of activeDirectives) {
      await ledger.updateDirectiveStatus(directive.id, 'completed');
    }

    return { decision: 'approve' };
  }

  // Block with detailed feedback
  return {
    decision: 'block',
    reason: formatBlockReason(verdict),
  };
}

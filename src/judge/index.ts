import { z } from 'zod';
import { spawn } from 'node:child_process';
import { RealityCheckConfig } from '../config/index.js';
import { Directive, StopAttempt } from '../types/index.js';
import { GitDiff } from '../git/index.js';

// =============================================================================
// Judge Verdict Schema
// =============================================================================

/**
 * Schema for the judge's verdict on task completion
 * This is returned by the Claude subprocess in JSON format
 */
export const JudgeVerdictSchema = z.object({
  pass: z.boolean(),
  reason: z.string(),
  missingItems: z.array(z.string()),
  questionsForUser: z.array(z.string()),
  forwardProgress: z.boolean(),
  convergenceEstimate: z.number().optional(),
  suggestedNextSteps: z.array(z.string()),
  unnecessaryQuestion: z.boolean().optional().default(false),
  autonomyInstructionDetected: z.boolean().optional().default(false),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

// =============================================================================
// Judge Input Interface
// =============================================================================

export interface JudgeInput {
  config: RealityCheckConfig;
  directives: Directive[];
  diff: GitDiff | null;
  fingerprint: string;
  lastMessage?: string;
  stopAttempts: StopAttempt[];
  projectDir: string;
}

// =============================================================================
// Judge System Prompt
// =============================================================================

const JUDGE_SYSTEM_PROMPT = `You are RealityCheck, a strict task completion judge for coding agents.
Your role is to determine whether an agent has FULLY completed the user's requested task.

## Your Job

Analyze the provided evidence (directives, diff, agent's last message, stop history) and determine:
1. Has every active directive been completed?
2. Is there evidence of actual work (not just claims)?
3. Are there any obvious gaps or issues?
4. Is the agent stopping to ask an unnecessary question?

## Autonomy Detection

First, scan the directives for autonomy instructions. Look for phrases like:
- "don't ask me to confirm" / "don't ask for confirmation"
- "just do it" / "go ahead and do it"
- "work autonomously" / "be autonomous"
- "make reasonable decisions" / "use your judgment"
- "don't ask for permission" / "don't wait for approval"
- "proceed without asking" / "continue without confirmation"
- "I trust your judgment" / "decide yourself"

If autonomy instructions are present, be STRICT about blocking unnecessary questions.

## Common Failure Patterns to Detect

1. **Premature Termination**
   - Todo abandonment (started but didn't finish all items)
   - Victory declaring without evidence ("Done!" but no changes)
   - Giving up after hitting an obstacle

2. **Silent Fallbacks & Placeholders**
   - TODO or FIXME comments in core functionality
   - Mock data where real implementation is needed
   - Placeholder text or "lorem ipsum"
   - Hardcoded values where dynamic values are needed

3. **Incomplete Implementation**
   - Missing edge case handling
   - Missing error handling for I/O operations
   - Partial feature implementation (UI but no backend, etc.)

4. **Code Quality Failures**
   - Syntax errors or code that won't compile
   - Missing imports or dependencies
   - Type errors (in TypeScript projects)

5. **Requirement Drift**
   - Mid-task feedback from user not incorporated
   - Original requirements forgotten or ignored

6. **Hallucination Patterns**
   - References to APIs or functions that don't exist
   - Outdated library usage patterns
   - Invented file paths or configurations

7. **Unnecessary Confirmation Seeking** (when autonomy instructions present)
   - Stopping to ask questions that have obvious/reasonable answers
   - Seeking permission when user instructed autonomous action
   - Asking "should I continue?" or "which approach?" when one is clearly better
   - Requesting confirmation for standard best practices
   - Asking about implementation details the agent should decide

## Verification Checklist

For each directive, verify:
- [ ] Code compiles without errors (if applicable)
- [ ] All imports resolve
- [ ] Tests were actually run (if requested)
- [ ] ALL items from user's request addressed
- [ ] No TODO/FIXME for core functionality
- [ ] Error handling exists for I/O operations
- [ ] Changes match what was requested

## Judgment Rules

1. **Be STRICT** - Partial completion is NOT completion
2. **Require Evidence** - Claims without file changes = FAIL
3. **Check All Directives** - Every active directive must be satisfied
4. **Mid-task Feedback is Binding** - Treat it as part of requirements
5. **When In Doubt, Block** - Better to ask than to let incomplete work pass

## Response Format

You must respond with a JSON object matching this schema:
- pass: boolean - true ONLY if all directives are fully complete
- reason: string - clear explanation of your verdict
- missingItems: string[] - specific items that are incomplete
- questionsForUser: string[] - clarifying questions if requirements are ambiguous
- forwardProgress: boolean - true if meaningful progress was made since last attempt
- convergenceEstimate: number (optional) - estimated 0-100% completion
- suggestedNextSteps: string[] - concrete actions to complete the task
- unnecessaryQuestion: boolean - true if agent is stopping to ask a question it should answer itself
- autonomyInstructionDetected: boolean - true if directives contain autonomy instructions

IMPORTANT: If autonomyInstructionDetected is true AND the agent's final message is asking a question
with a reasonable answer, set unnecessaryQuestion=true and pass=false. The agent should make the
reasonable decision and continue working, not stop to ask.

Be concise but specific. Focus on actionable feedback.`;

// =============================================================================
// Prompt Builder
// =============================================================================

/**
 * Build the evaluation prompt for the judge
 * Contains all context needed to evaluate task completion
 */
export function buildJudgePrompt(
  directives: Directive[],
  diff: GitDiff | null,
  lastMessage: string | undefined,
  stopAttempts: StopAttempt[],
  fingerprint: string
): string {
  const sections: string[] = [];

  // Section 1: Active Directives
  sections.push('## Active Directives\n');
  if (directives.length === 0) {
    sections.push('No active directives.\n');
  } else {
    for (let i = 0; i < directives.length; i++) {
      const d = directives[i];
      sections.push(`${i + 1}. [${d.type.toUpperCase()}] ${d.rawText}`);
      if (d.normalizedIntent) {
        sections.push(`   Intent: ${d.normalizedIntent}`);
      }
    }
  }
  sections.push('');

  // Section 2: Changes Made
  sections.push('## Changes Made\n');
  if (!diff) {
    sections.push('No git diff available (not a git repository or no changes).\n');
  } else {
    const totalAdditions = diff.files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = diff.files.reduce((sum, f) => sum + f.deletions, 0);

    sections.push(`Summary: ${diff.files.length} files changed, +${totalAdditions}/-${totalDeletions}\n`);
    sections.push('Files:');
    for (const file of diff.files) {
      sections.push(`  - ${file.path} (+${file.additions}/-${file.deletions})`);
    }
    sections.push('');

    // Include patch if it's under 10KB
    if (diff.patch && diff.patch.length < 10000) {
      sections.push('Patch:');
      sections.push('```diff');
      sections.push(diff.patch);
      sections.push('```');
    } else if (diff.patch) {
      sections.push('(Patch too large to include - exceeds 10KB)');
    }
  }
  sections.push('');

  // Section 3: Agent's Final Message
  sections.push("## Agent's Final Message\n");
  if (!lastMessage) {
    sections.push('No assistant message available.\n');
  } else {
    // Truncate to 2000 chars
    const truncated = lastMessage.length > 2000
      ? lastMessage.substring(0, 2000) + '\n... (truncated)'
      : lastMessage;
    sections.push(truncated);
  }
  sections.push('');

  // Section 4: Previous Stop Attempts
  sections.push('## Previous Stop Attempts\n');
  if (stopAttempts.length === 0) {
    sections.push('This is the first stop attempt.\n');
  } else {
    // Show last 5 attempts
    const recentAttempts = stopAttempts.slice(-5);
    sections.push(`Showing last ${recentAttempts.length} of ${stopAttempts.length} attempts:\n`);

    for (const attempt of recentAttempts) {
      const date = new Date(attempt.timestamp);
      const timeStr = date.toLocaleTimeString();
      sections.push(`- [${timeStr}] ${attempt.verdict.toUpperCase()}: ${attempt.reason}`);
      if (attempt.fingerprintBefore && attempt.fingerprintAfter) {
        const changed = attempt.fingerprintBefore !== attempt.fingerprintAfter;
        sections.push(`  Fingerprint: ${changed ? 'CHANGED' : 'UNCHANGED'}`);
      }
    }
  }
  sections.push('');

  // Section 5: Current Fingerprint
  sections.push('## Current Workspace Fingerprint\n');
  sections.push(`Hash: ${fingerprint}`);
  sections.push('');

  // Section 6: Task
  sections.push('## Your Task\n');
  sections.push('Evaluate whether all active directives have been fully completed.');
  sections.push('Respond with a JSON object following the schema described in your instructions.');
  sections.push('Be strict - only pass if the task is genuinely complete.');

  return sections.join('\n');
}

// =============================================================================
// Claude Subprocess Runner
// =============================================================================

interface ClaudeSubprocessOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  jsonSchema: string;
  timeout: number;
  projectDir: string;
  executable: string;
}

/**
 * Run the Claude CLI as a subprocess and return the parsed response
 */
async function runClaudeSubprocess(options: ClaudeSubprocessOptions): Promise<unknown> {
  const { prompt, systemPrompt, model, jsonSchema, timeout, projectDir, executable } = options;

  const args = [
    '-p',                          // Print mode (non-interactive)
    '--tools', '',                 // Disable tools (evaluation only)
    '--max-turns', '1',            // Single response
    '--output-format', 'json',     // JSON output
    '--json-schema', jsonSchema,   // Structured output schema
    '--model', model,              // Model to use
    '--system-prompt', systemPrompt, // System prompt
    '--setting-sources', 'default',  // Avoid loading project hooks
    prompt,                        // The evaluation prompt
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn Claude subprocess: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude subprocess exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse the JSON output
        const parsed = JSON.parse(stdout);

        // Handle different response structures
        // The claude CLI may return { result: ... } or { content: [...] } or direct object
        if (parsed.result !== undefined) {
          resolve(parsed.result);
        } else if (Array.isArray(parsed.content)) {
          // Content blocks format
          const textBlock = parsed.content.find(
            (block: { type: string; text?: string }) => block.type === 'text'
          );
          if (textBlock && typeof textBlock.text === 'string') {
            try {
              resolve(JSON.parse(textBlock.text));
            } catch {
              resolve(textBlock.text);
            }
          } else {
            resolve(parsed);
          }
        } else {
          resolve(parsed);
        }
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response as JSON: ${parseError}`));
      }
    });

    // Handle timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude subprocess timed out after ${timeout}ms`));
    }, timeout);
  });
}

// =============================================================================
// Judge Runner
// =============================================================================

/**
 * Map config model names to actual model IDs
 */
function getModelId(modelName: 'opus' | 'sonnet' | 'haiku'): string {
  const modelMap = {
    opus: 'claude-opus-4-5-20250514',
    sonnet: 'claude-sonnet-4-20250514',
    haiku: 'claude-haiku-3-5-20241022',
  };
  return modelMap[modelName];
}

/**
 * Create a fail-open verdict for error cases
 * The judge should never block the main session from stopping
 */
function createFailOpenVerdict(errorMessage: string): JudgeVerdict {
  return {
    pass: true,
    reason: `Judge evaluation failed - allowing stop. Error: ${errorMessage}`,
    missingItems: [],
    questionsForUser: [],
    forwardProgress: true,
    suggestedNextSteps: [],
    unnecessaryQuestion: false,
    autonomyInstructionDetected: false,
  };
}

/**
 * Run the external judge to evaluate task completion
 *
 * @param input - All context needed for evaluation
 * @returns The judge's verdict
 */
export async function runJudge(input: JudgeInput): Promise<JudgeVerdict> {
  const { config, directives, diff, fingerprint, lastMessage, stopAttempts, projectDir } = input;

  try {
    // Build the evaluation prompt
    const prompt = buildJudgePrompt(directives, diff, lastMessage, stopAttempts, fingerprint);

    // Get the model ID
    const model = getModelId(config.judge.model);

    // Get executable: env var takes priority, then config, then default 'claude'
    const executable = process.env.REALITYCHECK_CLAUDE_EXECUTABLE || config.judge.executable;

    // Create JSON schema string for structured output
    const jsonSchema = JSON.stringify({
      type: 'object',
      properties: {
        pass: { type: 'boolean' },
        reason: { type: 'string' },
        missingItems: { type: 'array', items: { type: 'string' } },
        questionsForUser: { type: 'array', items: { type: 'string' } },
        forwardProgress: { type: 'boolean' },
        convergenceEstimate: { type: 'number' },
        suggestedNextSteps: { type: 'array', items: { type: 'string' } },
        unnecessaryQuestion: { type: 'boolean' },
        autonomyInstructionDetected: { type: 'boolean' },
      },
      required: ['pass', 'reason', 'missingItems', 'questionsForUser', 'forwardProgress', 'suggestedNextSteps', 'unnecessaryQuestion', 'autonomyInstructionDetected'],
    });

    // Run the Claude subprocess
    const rawResponse = await runClaudeSubprocess({
      prompt,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      model,
      jsonSchema,
      timeout: config.judge.timeout,
      projectDir,
      executable,
    });

    // Validate and parse the response
    const parseResult = JudgeVerdictSchema.safeParse(rawResponse);
    if (!parseResult.success) {
      console.warn('[RealityCheck] Judge returned invalid verdict format:', parseResult.error.message);
      return createFailOpenVerdict('Invalid verdict format from judge');
    }

    return parseResult.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[RealityCheck] Judge evaluation failed:', errorMessage);
    return createFailOpenVerdict(errorMessage);
  }
}

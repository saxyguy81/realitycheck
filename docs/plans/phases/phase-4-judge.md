# Phase 4: Judge System

## Overview

Implement the external judge that evaluates task completion using a separate Claude subprocess. The judge receives directives, diffs, and history, then returns a structured verdict.

## Prerequisites

**Files that must exist from Phases 1-3:**
- `src/types/index.ts` - Including `Directive`, `StopAttempt` types
- `src/config/index.ts` - `RealityCheckConfig` with judge settings
- `src/git/index.ts` - `GitDiff` type
- `src/hooks/stop.ts` - Stop hook with stubbed judge call

**Verify previous phases complete:**
```bash
npm run build  # Should succeed
npm test       # Should pass
```

## Context

The judge is a separate Claude process invoked via `claude -p` (print mode). It:
- Receives a carefully crafted prompt with all context
- Returns structured JSON matching `JudgeVerdictSchema`
- Uses `--tools ""` to disable tools (evaluation only)
- Uses `--max-turns 1` for single response
- Uses `--json-schema` for structured output

The judge embodies the "courthouse model" - it's an impartial evaluator that determines if all directives have been satisfied.

## Deliverables

### 1. Judge Types and Schema (`src/judge/index.ts`)

```typescript
import { z } from 'zod';

export const JudgeVerdictSchema = z.object({
  pass: z.boolean(),
  reason: z.string(),
  missingItems: z.array(z.string()),
  questionsForUser: z.array(z.string()),
  forwardProgress: z.boolean(),
  convergenceEstimate: z.number().optional(),
  suggestedNextSteps: z.array(z.string()),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
```

### 2. Judge System Prompt

The system prompt defines the judge's role and evaluation criteria. Key sections:

**Role Definition:**
```
You are RealityCheck, a strict task completion judge for coding agents.
Your role is to determine whether an agent has FULLY completed the user's requested task.
```

**Common Failure Patterns to Detect:**
1. Premature Termination (todo abandonment, victory declaring without evidence)
2. Silent Fallbacks & Placeholders (TODO, FIXME, mock data)
3. Incomplete Implementation (missing edge cases, error handling)
4. Code Quality Failures (syntax errors, missing deps, type errors)
5. Requirement Drift (mid-task feedback not incorporated)
6. Hallucination Patterns (fake APIs, outdated usage)

**Verification Checklist:**
- Code compiles without errors
- All imports resolve
- Tests were actually run
- ALL items from user's request addressed
- No TODO/FIXME for core functionality
- Error handling exists for I/O

**Judgment Rules:**
1. Be STRICT - partial completion is NOT completion
2. Require Evidence - claims without file changes = FAIL
3. Check All Directives - every active one must be satisfied
4. Mid-task Feedback is Binding
5. When In Doubt, Block

### 3. Judge Runner (`src/judge/index.ts`)

```typescript
interface JudgeInput {
  config: RealityCheckConfig;
  directives: Directive[];
  diff: GitDiff | null;
  fingerprint: string;
  lastMessage?: string;
  stopAttempts: StopAttempt[];
  projectDir: string;
}

export async function runJudge(input: JudgeInput): Promise<JudgeVerdict>
```

Implementation:
1. Build judge prompt from inputs using `buildJudgePrompt()`
2. Select model based on config (`opus` or `sonnet`)
3. Create JSON schema string for structured output
4. Spawn `claude` subprocess with args:
   - `-p` (print mode)
   - `--tools ""` (no tools)
   - `--max-turns 1`
   - `--output-format json`
   - `--json-schema <schema>`
   - `--model <model>`
   - `--system-prompt <prompt>`
   - `--setting-sources default` (avoid loading project hooks)
5. Pass prompt as final argument
6. Parse JSON response and validate with `JudgeVerdictSchema`
7. On error: fail open (return pass=true with error note)

### 4. Prompt Builder

```typescript
function buildJudgePrompt(
  directives: Directive[],
  diff: GitDiff | null,
  lastMessage: string | undefined,
  stopAttempts: StopAttempt[],
  fingerprint: string,
): string
```

Build sections:
1. **Active Directives** - List each with type and text
2. **Changes Made** - Git diff summary and patch (if under 10KB)
3. **Agent's Final Message** - Last assistant message (truncated to 2000 chars)
4. **Previous Stop Attempts** - Recent history with missing items and fingerprints
5. **Current Fingerprint** - For progress detection
6. **Task** - Instructions to evaluate

### 5. Claude Subprocess Runner

```typescript
interface ClaudeSubprocessOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  jsonSchema: string;
  timeout: number;
  projectDir: string;
}

async function runClaudeSubprocess(options: ClaudeSubprocessOptions): Promise<unknown>
```

- Use `spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout })`
- Collect stdout and stderr
- Parse JSON output
- Handle different response structures (result field, content blocks, direct)

### 6. Update Stop Hook

Replace the stub in `src/hooks/stop.ts`:

```typescript
import { runJudge } from '../judge/index.js';

// In handleStop, replace runJudgeStub() with:
const verdict = await runJudge({
  config,
  directives: activeDirectives,
  diff: currentDiff,
  fingerprint: currentFingerprint,
  lastMessage: lastAssistantMessage?.content,
  stopAttempts: ledger.getStopAttempts(),
  projectDir: input.cwd,
});
```

### 7. Export Updates (`src/index.ts`)

```typescript
export * from './judge/index.js';
```

## Verification Criteria

### Automated
- [x] `npm run build` succeeds
- [x] Unit tests for prompt building pass
- [x] Unit tests for verdict parsing pass (mock subprocess)

### E2E Tests (No Manual Verification)
Add to `src/tests/e2e/judge.test.ts` (mock Claude CLI subprocess):
- [ ] Judge subprocess runner handles valid JSON response
- [ ] Judge subprocess runner handles timeout gracefully (fail-open)
- [ ] Judge subprocess runner handles malformed output gracefully
- [ ] Prompt builder includes all directive types correctly
- [ ] Verdict schema validation rejects invalid structures

## Implementation Notes

1. The judge timeout defaults to 30 seconds - may need adjustment
2. Use `--setting-sources default` to prevent recursive hook loading
3. Model IDs: `claude-opus-4-5-20250514`, `claude-sonnet-4-20250514`
4. Limit diff/message sizes to avoid token limits
5. On parse errors, log and fail open

## Error Handling

The judge should never cause the main session to fail. On any error:
```typescript
return {
  pass: true,
  reason: 'Judge evaluation failed - allowing stop',
  missingItems: [],
  questionsForUser: [],
  forwardProgress: true,
  suggestedNextSteps: [],
};
```

## After Completion

Run `/clear` and proceed to **Phase 5: Configuration and Installation**.

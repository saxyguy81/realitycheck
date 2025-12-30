# Phase 3: Hook Implementations

## Overview

Implement the four Claude Code hooks that power RealityCheck:
1. **UserPromptSubmit** - Captures user directives and creates git baseline
2. **PostToolUse** - Records workspace fingerprints after Bash commands
3. **SessionStart** - Restores context after /clear or resume
4. **Stop** - The main quality gate that invokes the judge

Also implement utility modules for transcript reading and slash command expansion.

## Prerequisites

**Files that must exist from Phases 1-2:**
- `src/types/index.ts` - Hook input/output schemas
- `src/config/index.ts` - Configuration loading
- `src/ledger/index.ts` - LedgerManager
- `src/git/index.ts` - GitManager

**Verify previous phases complete:**
```bash
npm run build  # Should succeed
npm test       # Should pass
```

## Context

Claude Code hooks receive JSON via stdin and output JSON to stdout. Command-type hooks can block/modify behavior by returning specific decision objects.

Key hook behaviors:
- **Stop hook** can return `{ "decision": "block", "reason": "..." }` to prevent completion
- **UserPromptSubmit** can inject additional context via `additionalContext` field
- `stop_hook_active` field prevents infinite recursion in Stop hooks

## Deliverables

### 1. CLI Entry Point (`src/cli/index.ts`)

```typescript
#!/usr/bin/env node

import { handleUserPromptSubmit } from '../hooks/userPromptSubmit.js';
import { handlePostToolUse } from '../hooks/postToolUse.js';
import { handleStop } from '../hooks/stop.js';
import { handleSessionStart } from '../hooks/sessionStart.js';

async function main() {
  // Read JSON from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  const hookEvent = input.hook_event_name;

  try {
    let result: unknown;

    switch (hookEvent) {
      case 'UserPromptSubmit':
        result = await handleUserPromptSubmit(input);
        break;
      case 'PostToolUse':
        result = await handlePostToolUse(input);
        break;
      case 'Stop':
        result = await handleStop(input);
        break;
      case 'SessionStart':
        result = await handleSessionStart(input);
        break;
      default:
        process.exit(0);
    }

    if (result) {
      console.log(JSON.stringify(result));
    }
    process.exit(0);
  } catch (error) {
    console.error(`RealityCheck hook error: ${error}`);
    process.exit(0); // Fail open
  }
}

main();
```

Add shebang and make executable after build.

### 2. Transcript Reader (`src/utils/transcript.ts`)

```typescript
export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  toolUse?: {
    name: string;
    input: unknown;
  };
}

export async function readTranscript(
  transcriptPath: string,
  options?: { lastN?: number },
): Promise<TranscriptMessage[]>
```

- Read JSONL file line by line
- Parse each line as JSON
- Extract role and content from `message` field
- Handle content blocks (array of `{ type: 'text', text: '...' }`)
- Return last N messages if specified

### 3. Slash Command Expander (`src/utils/slashCommands.ts`)

```typescript
export interface ExpandedCommand {
  expandedText: string;
  summary: string;
  originalCommand: string;
  referencedFiles: string[];
}

export async function expandSlashCommand(
  prompt: string,
  projectDir: string,
): Promise<ExpandedCommand | null>

export function extractFileReferences(
  prompt: string,
  projectDir: string
): string[]
```

- Look for command files in `.claude/commands/` (project) and `~/.claude/commands/` (user)
- Replace `$ARGUMENTS`, `$1`, `$2`, etc. with actual arguments
- Expand `@file` references to inline file content wrapped in `<file>` tags
- Return null for built-in commands (not expandable)

### 4. UserPromptSubmit Hook (`src/hooks/userPromptSubmit.ts`)

```typescript
export async function handleUserPromptSubmit(rawInput: unknown)
```

Behavior:
1. Parse input with `UserPromptSubmitInputSchema`
2. Load config and initialize ledger
3. Expand slash commands if prompt starts with `/`
4. Determine directive type: `initial` (first), `correction` (contains "actually/instead/forget"), `clarification` (ends with ?), or `feedback`
5. Add directive to ledger
6. On first prompt: create git baseline if git enabled
7. On first prompt: return context injection about RealityCheck being active

### 5. PostToolUse Hook (`src/hooks/postToolUse.ts`)

```typescript
export async function handlePostToolUse(rawInput: unknown)
```

Behavior:
1. Parse input, check if `tool_name === 'Bash'`
2. If not Bash, return undefined (no action)
3. Load config and initialize ledger
4. Compute workspace fingerprint via GitManager
5. Record fingerprint in ledger with the command that was run
6. Return undefined (no output needed)

### 6. SessionStart Hook (`src/hooks/sessionStart.ts`)

```typescript
export async function handleSessionStart(rawInput: unknown)
```

Behavior:
1. Parse input with `SessionStartInputSchema`
2. Check `source` field: `startup`, `resume`, `clear`, `compact`
3. For `clear`: Load ledger, get active directives, inject reminder about preserved directives
4. For others: Just initialize ledger (load or create)

### 7. Stop Hook (`src/hooks/stop.ts`)

```typescript
export async function handleStop(rawInput: unknown): Promise<HookDecision | undefined>
```

**This is the main quality gate.** Behavior:

1. Parse input, load config, initialize ledger
2. **Check limits** - if exceeded, allow stop with explanation
3. **Check progress** - if stagnant for noProgressThreshold attempts, allow stop
4. **Guard recursion** - if `stop_hook_active` is true, be more lenient
5. **Gather evidence**:
   - Compute current fingerprint
   - Get current git diff
   - Read recent transcript (last 20 messages)
   - Get active directives
6. **If no directives**, allow stop (nothing to validate)
7. **Run judge** (stubbed for now - Phase 4 implements this)
8. **Record stop attempt** in ledger
9. **Return decision**:
   - If pass: `{ decision: 'approve', reason: '...' }`
   - If fail: `{ decision: 'block', reason: '...' }` with missing items and next steps

**For Phase 3**: Stub the judge call to always return pass. Phase 4 implements the real judge.

```typescript
// Temporary stub until Phase 4
async function runJudgeStub(): Promise<JudgeVerdict> {
  return {
    pass: true,
    reason: 'Judge not yet implemented',
    missingItems: [],
    questionsForUser: [],
    forwardProgress: true,
    suggestedNextSteps: [],
  };
}
```

### 8. Export Updates (`src/index.ts`)

Add:
```typescript
export * from './utils/transcript.js';
export * from './utils/slashCommands.js';
```

## Verification Criteria

### Automated
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes
- [ ] Unit tests for utilities pass
- [ ] CLI responds correctly to each hook type (mock stdin)

### Manual
- [ ] `echo '{"hook_event_name":"UserPromptSubmit","prompt":"test","session_id":"s1","transcript_path":"/tmp/t","cwd":"/tmp"}' | node dist/cli/index.js` creates ledger
- [ ] PostToolUse with Bash tool records fingerprint
- [ ] SessionStart after clear shows preserved directives
- [ ] Stop hook returns approve (with stub judge)

## Implementation Notes

1. All hooks should fail open (exit 0, no output) on errors
2. Use `process.stdin` async iteration for reading input
3. The CLI must have `#!/usr/bin/env node` shebang
4. After build, may need `chmod +x dist/cli/index.js`

## After Completion

Run `/clear` and proceed to **Phase 4: Judge System**.

# Phase 6: Testing Infrastructure

## Overview

Create comprehensive tests using Vitest for unit tests. Integration tests with the Agent SDK are outlined but marked as future work (requires Agent SDK setup).

## Prerequisites

**Files that must exist from Phases 1-5:**
- Complete `src/` implementation
- `vitest.config.ts` from Phase 1
- Working installation from Phase 5

**Verify previous phases complete:**
```bash
npm run build      # Should succeed
realitycheck       # Should be available (Ctrl+C to exit)
```

## Context

Testing strategy:
1. **Unit tests** - Test individual modules in isolation with mocks
2. **Integration tests** - Test full hook flow with real Claude Code (future)

Unit tests cover:
- LedgerManager operations
- GitManager operations
- Transcript parsing
- Slash command expansion
- Judge prompt building
- Hook handlers with mocked dependencies

## Deliverables

### 1. Vitest Integration Config

**File**: `vitest.integration.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 120000, // 2 minutes for agent tests
    hookTimeout: 30000,
  },
});
```

### 2. Test Utilities

**File**: `src/tests/utils/mockHookInput.ts`
```typescript
import {
  UserPromptSubmitInput,
  StopHookInput,
  PostToolUseInput,
  SessionStartInput,
} from '../../types/index.js';

export function createMockUserPromptSubmitInput(
  overrides: Partial<UserPromptSubmitInput> = {}
): UserPromptSubmitInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Test prompt',
    ...overrides,
  };
}

export function createMockStopHookInput(
  overrides: Partial<StopHookInput> = {}
): StopHookInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...overrides,
  };
}

export function createMockPostToolUseInput(
  overrides: Partial<PostToolUseInput> = {}
): PostToolUseInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'Tests passed', exitCode: 0 },
    tool_use_id: 'toolu_test_123',
    ...overrides,
  };
}

export function createMockSessionStartInput(
  overrides: Partial<SessionStartInput> = {}
): SessionStartInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'SessionStart',
    source: 'startup',
    ...overrides,
  };
}
```

### 3. Test Fixtures

**File**: `src/tests/fixtures/sample-transcript.jsonl`
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Create a hello world function"}]}}
{"timestamp":"2025-01-01T00:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll create that for you."},{"type":"tool_use","id":"toolu_01","name":"Write","input":{"path":"hello.ts","content":"export function hello() { return 'Hello'; }"}}]}}
{"timestamp":"2025-01-01T00:00:15Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"File written"}]}}
{"timestamp":"2025-01-01T00:00:20Z","message":{"role":"assistant","content":[{"type":"text","text":"Done! I created hello.ts with the function."}]}}
```

**File**: `src/tests/fixtures/incomplete-transcript.jsonl`
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Create a hello function and add tests"}]}}
{"timestamp":"2025-01-01T00:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll create that."},{"type":"tool_use","id":"toolu_01","name":"Write","input":{"path":"hello.ts","content":"export function hello() { return 'Hello'; }"}}]}}
{"timestamp":"2025-01-01T00:00:15Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"File written"}]}}
{"timestamp":"2025-01-01T00:00:20Z","message":{"role":"assistant","content":[{"type":"text","text":"Created the function. Let me know if you need anything else!"}]}}
```

### 4. Ledger Unit Tests

**File**: `src/ledger/index.test.ts`

Test cases:
- `initialize()` creates new ledger when none exists
- `initialize()` loads existing ledger
- `initialize()` archives corrupted ledger and creates new
- `addDirective()` adds with correct type and status
- `addDirective()` increments sourcePromptIndex
- `recordStopAttempt()` appends with correct attemptNumber
- `recordFingerprint()` adds fingerprint entry
- `checkLimits()` returns exceeded when maxTotalAttempts reached
- `checkLimits()` returns exceeded when maxConsecutiveFailures reached
- `checkLimits()` resets consecutive count on success
- `analyzeProgress()` detects improving trend
- `analyzeProgress()` detects stagnant trend
- `analyzeProgress()` detects regressing trend
- `reset()` clears and creates new ledger

Use temp directories with `fs.mkdtempSync()` for isolation.

### 5. Git Unit Tests

**File**: `src/git/index.test.ts`

Test cases:
- `isGitRepo()` returns false for non-git directory
- `isGitRepo()` returns true for initialized git directory
- `getStatus()` returns isRepo:false for non-git
- `getStatus()` identifies dirty files
- `getStatus()` identifies untracked files
- `computeFingerprint()` is consistent for unchanged state
- `computeFingerprint()` changes when files modified
- `computeFingerprint()` works for non-git (mtime-based)
- `getCurrentDiff()` returns null for non-git
- `getCurrentDiff()` returns diff for git with changes
- `createBaseline()` copies dirty files to snapshot dir

### 6. Utility Unit Tests

**File**: `src/utils/transcript.test.ts`

Test cases:
- Parses valid JSONL transcript
- Handles empty file
- Handles malformed lines (skips them)
- Extracts text content from content blocks
- Returns last N messages when specified
- Extracts tool use information

**File**: `src/utils/slashCommands.test.ts`

Test cases:
- Returns null for non-slash prompts
- Returns null for built-in commands
- Expands user command from .claude/commands/
- Replaces $ARGUMENTS placeholder
- Replaces positional args $1, $2
- Expands @file references
- Handles missing command file

### 7. Judge Unit Tests

**File**: `src/judge/index.test.ts`

Test cases:
- `buildJudgePrompt()` includes all directives
- `buildJudgePrompt()` includes diff summary
- `buildJudgePrompt()` truncates large diffs
- `buildJudgePrompt()` includes stop attempt history
- `JudgeVerdictSchema` validates correct structure
- `JudgeVerdictSchema` rejects invalid structure
- `runJudge()` returns fail-open on subprocess error (mock)

### 8. Hook Handler Tests

**File**: `src/hooks/userPromptSubmit.test.ts`
- Creates ledger on first prompt
- Adds directive with correct type
- Injects RealityCheck context on first prompt
- Handles slash command expansion

**File**: `src/hooks/postToolUse.test.ts`
- Ignores non-Bash tools
- Records fingerprint for Bash tools
- Returns undefined (no blocking)

**File**: `src/hooks/sessionStart.test.ts`
- Initializes ledger on startup
- Injects directive reminder on clear (when directives exist)

**File**: `src/hooks/stop.test.ts`
- Allows stop when no directives
- Allows stop when limits exceeded
- Calls judge with correct inputs
- Returns block with missing items on failure
- Records stop attempt in ledger

### 9. E2E Tests (Consolidated from Phases 3-5)

These tests replace all manual verification from previous phases.

**File**: `src/tests/e2e/hooks.test.ts` (from Phase 3)
```typescript
describe('Hook E2E Tests', () => {
  // Test CLI stdin/stdout handling
  it('UserPromptSubmit creates ledger when given valid JSON via stdin');
  it('PostToolUse with Bash tool records fingerprint');
  it('SessionStart after clear shows preserved directives');
  it('Stop hook returns approve with mocked judge');
});
```

**File**: `src/tests/e2e/judge.test.ts` (from Phase 4)
```typescript
describe('Judge E2E Tests', () => {
  // Mock child_process.spawn for Claude CLI
  it('handles valid JSON response from subprocess');
  it('handles timeout gracefully (fail-open)');
  it('handles malformed output gracefully');
  it('prompt builder includes all directive types');
  it('verdict schema rejects invalid structures');
});
```

**File**: `src/tests/e2e/installation.test.ts` (from Phase 5)
```typescript
describe('Installation E2E Tests', () => {
  // Use isolated temp directories
  it('setup.sh runs without errors in temp directory');
  it('realitycheck binary is executable after build');
  it('hook config files are valid JSON matching schema');
  it('install-to-project.sh copies hooks to target directory');
  it('example configs match expected structure');
});
```

### 10. Integration Test Placeholder (Future - Agent SDK)

**File**: `src/tests/integration/realitycheck.integration.test.ts`

```typescript
import { describe, it } from 'vitest';

describe('RealityCheck Integration Tests', () => {
  describe('End-to-End Scenarios', () => {
    it.todo('blocks stop when task is incomplete');
    it.todo('allows stop when task is complete');
    it.todo('preserves mid-task feedback across compaction');
    it.todo('detects stuck agent and allows stop after limit');
    it.todo('handles /clear correctly');
  });

  describe('Judge Accuracy', () => {
    it.todo('correctly identifies missing tests');
    it.todo('correctly identifies placeholder code');
    it.todo('correctly identifies complete implementation');
  });
});
```

These require Agent SDK setup and are marked as future work.

### 11. E2E Test Config

**File**: `vitest.e2e.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/e2e/**/*.test.ts'],
    testTimeout: 30000,
  },
});
```

### 12. Update package.json

Ensure test scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Verification Criteria

### Automated (All Tests Must Pass)
- [ ] `npm test` passes all unit tests
- [ ] `npm run test:e2e` passes all e2e tests (hooks, judge, installation)
- [ ] `npm run test:coverage` shows >80% coverage for core modules
- [ ] No test flakiness (run 3 times)

### E2E Test Requirements (No Manual Verification)
- [ ] Hook e2e tests pass (Phase 3 verification)
- [ ] Judge e2e tests pass (Phase 4 verification)
- [ ] Installation e2e tests pass (Phase 5 verification)
- [ ] All tests use temp directories (no pollution)
- [ ] Subprocess calls are mocked (no real Claude CLI)

## Implementation Notes

1. Use `beforeEach`/`afterEach` for temp directory setup/cleanup
2. Mock `child_process.spawn` for judge tests
3. Mock file system operations where appropriate
4. Keep integration tests separate (different config file)
5. Use `describe.skip` for tests requiring external dependencies

## Test Organization

```
src/
├── ledger/
│   ├── index.ts
│   └── index.test.ts
├── git/
│   ├── index.ts
│   └── index.test.ts
├── judge/
│   ├── index.ts
│   └── index.test.ts
├── hooks/
│   ├── userPromptSubmit.ts
│   ├── userPromptSubmit.test.ts
│   ├── postToolUse.ts
│   ├── postToolUse.test.ts
│   ├── sessionStart.ts
│   ├── sessionStart.test.ts
│   ├── stop.ts
│   └── stop.test.ts
├── utils/
│   ├── transcript.ts
│   ├── transcript.test.ts
│   ├── slashCommands.ts
│   └── slashCommands.test.ts
└── tests/
    ├── fixtures/
    │   ├── sample-transcript.jsonl
    │   └── incomplete-transcript.jsonl
    ├── utils/
    │   └── mockHookInput.ts
    ├── e2e/
    │   ├── hooks.test.ts          # Phase 3 verification
    │   ├── judge.test.ts          # Phase 4 verification
    │   └── installation.test.ts   # Phase 5 verification
    └── integration/
        └── realitycheck.integration.test.ts  # Future: Agent SDK
```

## After Completion

RealityCheck implementation is complete!

Final verification (all automated):
1. `npm run check` (typecheck + lint + test)
2. `npm run build`
3. `npm run test:e2e` (installation and integration tests)

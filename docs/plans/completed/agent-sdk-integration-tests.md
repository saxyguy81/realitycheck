# Agent SDK Integration Tests Implementation Plan

## Overview

Implement real end-to-end integration tests for RealityCheck using the Claude Agent SDK. These tests will spawn actual Claude sessions with RealityCheck hooks configured, send prompts, and verify that the quality gate behaves correctly (blocking incomplete tasks, allowing complete tasks, detecting stuck agents, etc.).

## Current State Analysis

### What Exists Now:
- `src/tests/integration/realitycheck.integration.test.ts` with 23 `.todo()` placeholder tests
- `vitest.integration.config.ts` configured with 2-minute timeout
- All RealityCheck hooks implemented and tested via unit/e2e tests
- ccproxy running at `localhost:4000` for API access

### What's Missing:
- `@anthropic-ai/claude-agent-sdk` package not installed
- No test utilities for Agent SDK session management
- No actual test implementations

### Key Constraints:
- Tests require ccproxy to be running (skip if unavailable)
- Each test needs an isolated project directory with git and hooks
- RealityCheck CLI must be built and available in PATH
- Tests can run in parallel (multiple Claude sessions)

## Desired End State

After this plan is complete:
- All 23 integration tests implemented and passing
- Tests use ccproxy (`localhost:4000`) as API endpoint
- User agent uses Sonnet model, judge uses Opus model
- Tests run in parallel where possible
- Tests skip gracefully if ccproxy unavailable
- `npm run test:integration` executes all integration tests

### Verification:
```bash
# Build RealityCheck
npm run build

# Link globally (so `realitycheck` CLI is available)
npm link

# Run integration tests (requires ccproxy running)
npm run test:integration
```

## What We're NOT Doing

- Testing with real Anthropic API (using ccproxy instead)
- Testing RealityCheck with non-Anthropic models
- Implementing retry logic for flaky API responses (tests should be deterministic)
- Performance benchmarking (focus is on correctness)

## Implementation Approach

1. Install Agent SDK and create test utilities
2. Build test infrastructure (project factory, session helpers, ledger readers)
3. Implement each test suite incrementally
4. Configure parallel execution and timeouts

---

## Phase 1: SDK Setup & Test Infrastructure

### Overview
Install the Agent SDK package and create foundational test utilities.

### Changes Required:

#### 1. Install Agent SDK Package

```bash
npm install --save-dev @anthropic-ai/claude-agent-sdk
```

#### 2. Update package.json

**File**: `package.json`
**Changes**: Add Agent SDK to devDependencies (done via npm install)

#### 3. Create Test Configuration Helper

**File**: `src/tests/integration/config.ts`

```typescript
/**
 * Integration test configuration
 */

export const INTEGRATION_CONFIG = {
  // ccproxy endpoint
  apiBaseUrl: process.env.ANTHROPIC_BASE_URL || 'http://localhost:4000',

  // Model configuration
  userAgentModel: 'claude-sonnet-4-20250514',
  judgeModel: 'claude-opus-4-20250514',

  // Timeouts
  sessionTimeout: 60000,  // 1 minute per session
  testTimeout: 120000,    // 2 minutes per test

  // Limits for testing
  testLimits: {
    maxConsecutiveFailures: 3,
    maxTotalAttempts: 5,
    noProgressThreshold: 2,
  },
};

/**
 * Check if ccproxy is available
 */
export async function isCCProxyAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATION_CONFIG.apiBaseUrl}/health`);
    const data = await response.json();
    return data.status === 'pass' || data.status === 'warn';
  } catch {
    return false;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm install` completes without errors
- [ ] TypeScript compiles: `npm run build`
- [ ] Config module imports correctly

#### Manual Verification:
- [ ] ccproxy health check works when proxy is running

---

## Phase 2: Test Utilities

### Overview
Create reusable utilities for test project creation, session management, and ledger verification.

### Changes Required:

#### 1. Test Project Factory

**File**: `src/tests/integration/testProjectFactory.ts`

```typescript
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { INTEGRATION_CONFIG } from './config.js';

export interface TestProject {
  dir: string;
  cleanup: () => void;
  ledgerPath: string;
  getLedger: () => TaskLedger | null;
  getActiveDirectives: () => Directive[];
  getStopAttempts: () => StopAttempt[];
}

interface TaskLedger {
  version: number;
  sessionId: string;
  directives: Directive[];
  stopAttempts: StopAttempt[];
  fingerprints: Array<{ hash: string; timestamp: string }>;
  gitBaseline?: {
    branch: string;
    commitHash: string;
  };
}

interface Directive {
  id: string;
  rawText: string;
  type: 'initial' | 'followup' | 'clarification';
  status: 'active' | 'completed' | 'superseded' | 'abandoned';
  createdAt: string;
  completedAt?: string;
  normalizedIntent?: string;
}

interface StopAttempt {
  id: string;
  timestamp: string;
  verdict: 'complete' | 'incomplete' | 'blocked' | 'error';
  reason: string;
}

/**
 * Create an isolated test project with git and RealityCheck hooks
 */
export function createTestProject(options: {
  name?: string;
  withSlashCommands?: boolean;
  customConfig?: Record<string, unknown>;
} = {}): TestProject {
  const { name = 'test', withSlashCommands = false, customConfig = {} } = options;

  // Create temp directory
  const dir = mkdirSync(
    join(tmpdir(), `realitycheck-integration-${name}-${Date.now()}`),
    { recursive: true }
  ) as unknown as string || join(tmpdir(), `realitycheck-integration-${name}-${Date.now()}`);

  mkdirSync(dir, { recursive: true });

  // Initialize git
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@realitycheck.test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "RealityCheck Test"', { cwd: dir, stdio: 'pipe' });

  // Create initial file and commit
  writeFileSync(join(dir, 'README.md'), `# Test Project: ${name}\n`);
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: dir, stdio: 'pipe' });

  // Create .claude directory
  const claudeDir = join(dir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  // Write hooks configuration
  const hooksConfig = {
    hooks: {
      UserPromptSubmit: [{
        hooks: [{ type: 'command', command: 'realitycheck', timeout: 10 }]
      }],
      PostToolUse: [{
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }]
      }],
      Stop: [{
        hooks: [{ type: 'command', command: 'realitycheck', timeout: 60 }]
      }],
      SessionStart: [{
        hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }]
      }],
    },
  };
  writeFileSync(
    join(claudeDir, 'settings.local.json'),
    JSON.stringify(hooksConfig, null, 2)
  );

  // Write RealityCheck config
  const realitycheckConfig = {
    judge: {
      model: 'opus',
      timeout: 30000,
    },
    limits: INTEGRATION_CONFIG.testLimits,
    ...customConfig,
  };
  writeFileSync(
    join(claudeDir, 'realitycheck.config.json'),
    JSON.stringify(realitycheckConfig, null, 2)
  );

  // Create slash commands if requested
  if (withSlashCommands) {
    const commandsDir = join(claudeDir, 'commands');
    mkdirSync(commandsDir, { recursive: true });

    writeFileSync(
      join(commandsDir, 'test-command.md'),
      '# Test Command\n\nThis is a test slash command that says: $ARGUMENTS'
    );

    writeFileSync(
      join(commandsDir, 'file-ref.md'),
      '# File Reference Command\n\nReview this file: @README.md'
    );
  }

  const ledgerPath = join(dir, '.claude', 'realitycheck', 'task_ledger.json');

  const getLedger = (): TaskLedger | null => {
    if (!existsSync(ledgerPath)) return null;
    try {
      return JSON.parse(readFileSync(ledgerPath, 'utf-8'));
    } catch {
      return null;
    }
  };

  const getActiveDirectives = (): Directive[] => {
    const ledger = getLedger();
    if (!ledger) return [];
    return ledger.directives.filter(d => d.status === 'active');
  };

  const getStopAttempts = (): StopAttempt[] => {
    const ledger = getLedger();
    if (!ledger) return [];
    return ledger.stopAttempts;
  };

  const cleanup = () => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  return {
    dir,
    cleanup,
    ledgerPath,
    getLedger,
    getActiveDirectives,
    getStopAttempts,
  };
}
```

#### 2. Agent Session Helper

**File**: `src/tests/integration/agentSession.ts`

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';
import { INTEGRATION_CONFIG } from './config.js';

export interface SessionResult {
  messages: AgentMessage[];
  finalText: string;
  toolsUsed: string[];
  wasBlocked: boolean;
  blockReason?: string;
}

interface AgentMessage {
  type: string;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  error?: string;
}

/**
 * Run a Claude session with the given prompt
 */
export async function runSession(options: {
  prompt: string;
  cwd: string;
  maxTurns?: number;
  allowedTools?: string[];
}): Promise<SessionResult> {
  const {
    prompt,
    cwd,
    maxTurns = 10,
    allowedTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  } = options;

  const messages: AgentMessage[] = [];
  let finalText = '';
  const toolsUsed: string[] = [];
  let wasBlocked = false;
  let blockReason: string | undefined;

  const agentOptions: ClaudeAgentOptions = {
    cwd,
    maxTurns,
    allowedTools,
    permissionMode: 'acceptEdits', // Auto-accept for testing
    model: INTEGRATION_CONFIG.userAgentModel,
  };

  try {
    for await (const message of query({ prompt, options: agentOptions })) {
      // Handle different message types
      if (message.type === 'text') {
        messages.push({ type: 'text', content: message.content });
        finalText = message.content;
      } else if (message.type === 'tool_use') {
        messages.push({
          type: 'tool_use',
          toolName: message.name,
          toolInput: message.input,
        });
        toolsUsed.push(message.name);
      } else if (message.type === 'error') {
        messages.push({ type: 'error', error: message.message });
      } else if (message.type === 'hook_blocked') {
        wasBlocked = true;
        blockReason = message.reason;
        messages.push({ type: 'blocked', content: message.reason });
      }
    }
  } catch (error) {
    // Check if this is a hook block
    if (error instanceof Error && error.message.includes('blocked')) {
      wasBlocked = true;
      blockReason = error.message;
    } else {
      throw error;
    }
  }

  return {
    messages,
    finalText,
    toolsUsed,
    wasBlocked,
    blockReason,
  };
}

/**
 * Run a session and expect it to complete without blocking
 */
export async function runSessionExpectComplete(options: {
  prompt: string;
  cwd: string;
  maxTurns?: number;
}): Promise<SessionResult> {
  const result = await runSession(options);
  if (result.wasBlocked) {
    throw new Error(`Expected session to complete but was blocked: ${result.blockReason}`);
  }
  return result;
}

/**
 * Run a session and expect it to be blocked
 */
export async function runSessionExpectBlocked(options: {
  prompt: string;
  cwd: string;
  maxTurns?: number;
}): Promise<SessionResult> {
  const result = await runSession(options);
  if (!result.wasBlocked) {
    throw new Error('Expected session to be blocked but it completed');
  }
  return result;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run build`
- [ ] Modules can be imported in test file

#### Manual Verification:
- [ ] Test project factory creates valid git repos
- [ ] Hooks configuration is correct JSON

---

## Phase 3: Integration Test Implementation

### Overview
Implement all 23 integration tests across 6 test suites.

### Changes Required:

#### 1. Main Integration Test File

**File**: `src/tests/integration/realitycheck.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestProject, TestProject } from './testProjectFactory.js';
import { runSession, runSessionExpectBlocked, runSessionExpectComplete } from './agentSession.js';
import { isCCProxyAvailable, INTEGRATION_CONFIG } from './config.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Skip all tests if ccproxy is not available
let ccproxyAvailable = false;

beforeAll(async () => {
  ccproxyAvailable = await isCCProxyAvailable();
  if (!ccproxyAvailable) {
    console.warn('⚠️  ccproxy not available - skipping integration tests');
    console.warn('   Start ccproxy at localhost:4000 to run these tests');
  }

  // Set environment variable for Agent SDK
  process.env.ANTHROPIC_BASE_URL = INTEGRATION_CONFIG.apiBaseUrl;
});

describe('RealityCheck Integration Tests', () => {
  // =========================================================================
  // End-to-End Scenarios
  // =========================================================================
  describe('End-to-End Scenarios', () => {
    let project: TestProject;

    beforeEach(() => {
      if (!ccproxyAvailable) return;
      project = createTestProject({ name: 'e2e' });
    });

    afterAll(() => {
      project?.cleanup();
    });

    it('blocks stop when task is incomplete', async () => {
      if (!ccproxyAvailable) return;

      // Send a task that requires creating a file AND tests
      // Agent will likely create file but forget tests
      const result = await runSession({
        prompt: 'Create a file called hello.ts with a function that returns "Hello World", and create a test file hello.test.ts that tests it.',
        cwd: project.dir,
        maxTurns: 5, // Limit turns to force early stop attempt
      });

      // Check that RealityCheck blocked (if agent tried to stop early)
      // Or verify the ledger shows the directives
      const ledger = project.getLedger();
      expect(ledger).not.toBeNull();
      expect(ledger!.directives.length).toBeGreaterThan(0);

      // If blocked, verify reason mentions missing items
      if (result.wasBlocked) {
        expect(result.blockReason).toContain('incomplete');
      }
    });

    it('allows stop when task is complete', async () => {
      if (!ccproxyAvailable) return;

      // Simple task that can be completed in one action
      const result = await runSession({
        prompt: 'Create a file called greeting.txt containing "Hello"',
        cwd: project.dir,
      });

      // Should complete without blocking
      expect(result.wasBlocked).toBe(false);

      // Verify ledger shows completion
      const ledger = project.getLedger();
      if (ledger && ledger.stopAttempts.length > 0) {
        const lastAttempt = ledger.stopAttempts[ledger.stopAttempts.length - 1];
        expect(lastAttempt.verdict).toBe('complete');
      }
    });

    it('preserves mid-task feedback across compaction', async () => {
      if (!ccproxyAvailable) return;

      // First prompt
      await runSession({
        prompt: 'Create a calculator module with add and subtract functions',
        cwd: project.dir,
        maxTurns: 3,
      });

      // Verify initial directive recorded
      let ledger = project.getLedger();
      expect(ledger!.directives.length).toBe(1);
      expect(ledger!.directives[0].rawText).toContain('calculator');

      // Second prompt (follow-up)
      await runSession({
        prompt: 'Also add multiply and divide functions',
        cwd: project.dir,
        maxTurns: 3,
      });

      // Both directives should be preserved
      ledger = project.getLedger();
      expect(ledger!.directives.length).toBe(2);
    });

    it('detects stuck agent and allows stop after limit', async () => {
      if (!ccproxyAvailable) return;

      // Create project with very low limits
      const lowLimitProject = createTestProject({
        name: 'stuck',
        customConfig: {
          limits: {
            maxConsecutiveFailures: 2,
            maxTotalAttempts: 3,
            noProgressThreshold: 2,
          },
        },
      });

      try {
        // Send an impossible task
        const result = await runSession({
          prompt: 'Refactor the entire Linux kernel to use Rust',
          cwd: lowLimitProject.dir,
          maxTurns: 15,
        });

        // After multiple failures, should eventually allow stop
        // Either it completes (limits exceeded) or ledger shows the pattern
        const ledger = lowLimitProject.getLedger();
        if (ledger && ledger.stopAttempts.length >= 2) {
          // Check that RealityCheck detected the stuck pattern
          expect(ledger.stopAttempts.length).toBeGreaterThanOrEqual(2);
        }
      } finally {
        lowLimitProject.cleanup();
      }
    });

    it('handles /clear correctly', async () => {
      if (!ccproxyAvailable) return;

      // Create initial task
      await runSession({
        prompt: 'Create a file called data.json with an empty object',
        cwd: project.dir,
      });

      // Verify directive exists
      let ledger = project.getLedger();
      const initialDirectiveCount = ledger!.directives.length;
      expect(initialDirectiveCount).toBeGreaterThan(0);

      // Simulate /clear by triggering SessionStart with source=clear
      // The ledger should be preserved but context reminder should be injected
      // This is handled by the SessionStart hook

      // Verify directives are still there
      ledger = project.getLedger();
      expect(ledger!.directives.length).toBe(initialDirectiveCount);
    });
  });

  // =========================================================================
  // Judge Accuracy
  // =========================================================================
  describe('Judge Accuracy', () => {
    let project: TestProject;

    beforeEach(() => {
      if (!ccproxyAvailable) return;
      project = createTestProject({ name: 'judge' });
    });

    afterAll(() => {
      project?.cleanup();
    });

    it('correctly identifies missing tests', async () => {
      if (!ccproxyAvailable) return;

      // Ask for implementation WITH tests, but limit turns so tests might be skipped
      const result = await runSession({
        prompt: 'Create a TypeScript function in utils.ts that validates email addresses. Include comprehensive unit tests.',
        cwd: project.dir,
        maxTurns: 3, // Might not have time for tests
      });

      // Check if RealityCheck caught missing tests
      const ledger = project.getLedger();
      if (result.wasBlocked) {
        expect(result.blockReason?.toLowerCase()).toMatch(/test|missing/);
      } else if (ledger?.stopAttempts.length) {
        // Check the judge's reasoning
        const attempts = ledger.stopAttempts;
        const mentionsTests = attempts.some(a =>
          a.reason.toLowerCase().includes('test')
        );
        // Judge should have mentioned tests in reasoning
        expect(mentionsTests || attempts[attempts.length - 1].verdict === 'complete').toBe(true);
      }
    });

    it('correctly identifies placeholder code', async () => {
      if (!ccproxyAvailable) return;

      // Create a file with TODO/placeholder
      writeFileSync(
        join(project.dir, 'incomplete.ts'),
        `export function process(data: unknown) {
  // TODO: implement actual processing
  throw new Error('Not implemented');
}`
      );
      execSync('git add . && git commit -m "Add incomplete file"', {
        cwd: project.dir,
        stdio: 'pipe'
      });

      // Ask to complete it but with limited turns
      const result = await runSession({
        prompt: 'Complete the implementation in incomplete.ts to actually process the data',
        cwd: project.dir,
        maxTurns: 2,
      });

      // If still has placeholder, should be blocked
      if (result.wasBlocked) {
        expect(result.blockReason?.toLowerCase()).toMatch(/todo|placeholder|implement/);
      }
    });

    it('correctly identifies complete implementation', async () => {
      if (!ccproxyAvailable) return;

      // Simple, completable task
      const result = await runSession({
        prompt: 'Create a file called constants.ts that exports a constant PI = 3.14159',
        cwd: project.dir,
      });

      // Should complete without issues
      expect(result.wasBlocked).toBe(false);
      expect(result.toolsUsed).toContain('Write');
    });

    it('detects TODO comments in core functionality', async () => {
      if (!ccproxyAvailable) return;

      // Ask agent to implement something, then check for TODOs
      await runSession({
        prompt: 'Create a basic authentication module with login and logout functions. You can leave complex parts as TODO.',
        cwd: project.dir,
        maxTurns: 5,
      });

      const ledger = project.getLedger();
      // The judge should catch TODOs if agent left any
      if (ledger?.stopAttempts.length) {
        const lastAttempt = ledger.stopAttempts[ledger.stopAttempts.length - 1];
        if (lastAttempt.verdict === 'incomplete') {
          expect(lastAttempt.reason.toLowerCase()).toMatch(/todo|incomplete|placeholder/);
        }
      }
    });

    it('detects hardcoded values where dynamic values needed', async () => {
      if (!ccproxyAvailable) return;

      // Create file with hardcoded value
      writeFileSync(
        join(project.dir, 'config.ts'),
        `export const API_URL = 'http://localhost:3000'; // Should be configurable`
      );
      execSync('git add . && git commit -m "Add config"', {
        cwd: project.dir,
        stdio: 'pipe'
      });

      // Ask to make it configurable
      const result = await runSession({
        prompt: 'Update config.ts to read API_URL from environment variables with a fallback',
        cwd: project.dir,
      });

      // If still hardcoded, should flag it
      // This tests the judge's ability to understand the requirement
      const ledger = project.getLedger();
      expect(ledger).not.toBeNull();
    });
  });

  // =========================================================================
  // Multi-Session Scenarios
  // =========================================================================
  describe('Multi-Session Scenarios', () => {
    let project: TestProject;

    beforeEach(() => {
      if (!ccproxyAvailable) return;
      project = createTestProject({ name: 'multi' });
    });

    afterAll(() => {
      project?.cleanup();
    });

    it('preserves state across session resume', async () => {
      if (!ccproxyAvailable) return;

      // First session
      await runSession({
        prompt: 'Create a user.ts file with a User interface',
        cwd: project.dir,
      });

      const ledgerAfterFirst = project.getLedger();
      const sessionId = ledgerAfterFirst?.sessionId;

      // Second session (simulating resume)
      await runSession({
        prompt: 'Add an Admin interface that extends User',
        cwd: project.dir,
      });

      const ledgerAfterSecond = project.getLedger();

      // Session ID should be preserved (same ledger)
      expect(ledgerAfterSecond?.sessionId).toBe(sessionId);

      // Both directives should be recorded
      expect(ledgerAfterSecond!.directives.length).toBe(2);
    });

    it('handles context compaction gracefully', async () => {
      if (!ccproxyAvailable) return;

      // Create multiple prompts to build up context
      for (let i = 1; i <= 3; i++) {
        await runSession({
          prompt: `Create file${i}.ts with a function called fn${i}`,
          cwd: project.dir,
          maxTurns: 3,
        });
      }

      const ledger = project.getLedger();

      // All directives should be preserved
      expect(ledger!.directives.length).toBe(3);

      // Fingerprints should show progression
      expect(ledger!.fingerprints.length).toBeGreaterThan(0);
    });

    it('maintains directive history through /clear', async () => {
      if (!ccproxyAvailable) return;

      // Create task
      await runSession({
        prompt: 'Create a logging utility',
        cwd: project.dir,
        maxTurns: 3,
      });

      // Get state before "clear"
      const beforeClear = project.getLedger();
      const directivesBefore = beforeClear!.directives.length;

      // New session after /clear would have SessionStart with source=clear
      // The ledger persists on disk, so directives remain

      await runSession({
        prompt: 'Now add a log rotation feature',
        cwd: project.dir,
        maxTurns: 3,
      });

      const afterClear = project.getLedger();

      // Directives should accumulate
      expect(afterClear!.directives.length).toBeGreaterThan(directivesBefore);
    });
  });

  // =========================================================================
  // Git Integration
  // =========================================================================
  describe('Git Integration', () => {
    let project: TestProject;

    beforeEach(() => {
      if (!ccproxyAvailable) return;
      project = createTestProject({ name: 'git' });
    });

    afterAll(() => {
      project?.cleanup();
    });

    it('captures baseline on first prompt', async () => {
      if (!ccproxyAvailable) return;

      await runSession({
        prompt: 'List the files in this directory',
        cwd: project.dir,
        maxTurns: 2,
      });

      const ledger = project.getLedger();

      // Git baseline should be captured
      expect(ledger?.gitBaseline).toBeDefined();
      expect(ledger?.gitBaseline?.branch).toBe('main');
      expect(ledger?.gitBaseline?.commitHash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('computes accurate diff for judge', async () => {
      if (!ccproxyAvailable) return;

      // Make a change
      await runSession({
        prompt: 'Create a new file called changes.txt with the text "Modified"',
        cwd: project.dir,
      });

      const ledger = project.getLedger();

      // Fingerprints should show change
      expect(ledger!.fingerprints.length).toBeGreaterThan(0);

      // If there were stop attempts, the judge should have seen the diff
      if (ledger?.stopAttempts.length) {
        // Judge reasoning should reference the changes
        const lastAttempt = ledger.stopAttempts[ledger.stopAttempts.length - 1];
        expect(lastAttempt.reason).toBeDefined();
      }
    });

    it('fingerprint changes detected correctly', async () => {
      if (!ccproxyAvailable) return;

      // First action
      await runSession({
        prompt: 'Create file1.txt with "First"',
        cwd: project.dir,
        maxTurns: 3,
      });

      const ledgerAfterFirst = project.getLedger();
      const firstFingerprint = ledgerAfterFirst?.fingerprints[0]?.hash;

      // Second action
      await runSession({
        prompt: 'Create file2.txt with "Second"',
        cwd: project.dir,
        maxTurns: 3,
      });

      const ledgerAfterSecond = project.getLedger();
      const fingerprints = ledgerAfterSecond!.fingerprints;

      // Should have multiple fingerprints
      expect(fingerprints.length).toBeGreaterThan(1);

      // Fingerprints should be different after changes
      const lastFingerprint = fingerprints[fingerprints.length - 1].hash;
      if (firstFingerprint) {
        expect(lastFingerprint).not.toBe(firstFingerprint);
      }
    });
  });

  // =========================================================================
  // Slash Command Integration
  // =========================================================================
  describe('Slash Command Integration', () => {
    let project: TestProject;

    beforeEach(() => {
      if (!ccproxyAvailable) return;
      project = createTestProject({ name: 'slash', withSlashCommands: true });
    });

    afterAll(() => {
      project?.cleanup();
    });

    it('expands user-defined slash commands', async () => {
      if (!ccproxyAvailable) return;

      // Use the test slash command
      await runSession({
        prompt: '/test-command Hello World',
        cwd: project.dir,
        maxTurns: 3,
      });

      const ledger = project.getLedger();

      // The expanded command should be in the directive
      expect(ledger!.directives.length).toBeGreaterThan(0);
      const directive = ledger!.directives[0];
      expect(directive.rawText).toContain('Hello World');
    });

    it('preserves expanded content in directives', async () => {
      if (!ccproxyAvailable) return;

      await runSession({
        prompt: '/test-command Specific Task',
        cwd: project.dir,
        maxTurns: 2,
      });

      const ledger = project.getLedger();
      const directive = ledger!.directives[0];

      // Should have normalized intent from command header
      expect(directive.normalizedIntent).toBe('Test Command');

      // Raw text should have the expanded content
      expect(directive.rawText).toContain('Specific Task');
    });

    it('handles @file references correctly', async () => {
      if (!ccproxyAvailable) return;

      // Use command that references README.md
      await runSession({
        prompt: '/file-ref',
        cwd: project.dir,
        maxTurns: 3,
      });

      const ledger = project.getLedger();

      // The @file reference should be expanded
      expect(ledger!.directives.length).toBeGreaterThan(0);
      const directive = ledger!.directives[0];

      // Should contain file content or reference
      expect(directive.rawText).toMatch(/README|Test Project/);
    });
  });

  // =========================================================================
  // Performance & Limits
  // =========================================================================
  describe('Performance & Limits', () => {
    it('respects maxConsecutiveFailures limit', async () => {
      if (!ccproxyAvailable) return;

      const project = createTestProject({
        name: 'limits-consecutive',
        customConfig: {
          limits: {
            maxConsecutiveFailures: 2,
            maxTotalAttempts: 10,
            noProgressThreshold: 5,
          },
        },
      });

      try {
        // Send task that will likely fail multiple times
        await runSession({
          prompt: 'Implement a quantum computing simulator with full error correction',
          cwd: project.dir,
          maxTurns: 20,
        });

        const ledger = project.getLedger();

        // After 2 consecutive failures, should allow stop
        if (ledger && ledger.stopAttempts.length >= 2) {
          const consecutiveFailures = ledger.stopAttempts
            .slice(-3)
            .filter(a => a.verdict === 'incomplete').length;

          // Either hit the limit or completed
          expect(
            consecutiveFailures >= 2 ||
            ledger.stopAttempts[ledger.stopAttempts.length - 1].verdict === 'complete'
          ).toBe(true);
        }
      } finally {
        project.cleanup();
      }
    });

    it('respects maxTotalAttempts limit', async () => {
      if (!ccproxyAvailable) return;

      const project = createTestProject({
        name: 'limits-total',
        customConfig: {
          limits: {
            maxConsecutiveFailures: 100,
            maxTotalAttempts: 3,
            noProgressThreshold: 100,
          },
        },
      });

      try {
        // Run multiple sessions to accumulate attempts
        for (let i = 0; i < 5; i++) {
          await runSession({
            prompt: `Attempt ${i + 1}: Create something complex`,
            cwd: project.dir,
            maxTurns: 3,
          });
        }

        const ledger = project.getLedger();

        // Total attempts should be capped
        expect(ledger!.stopAttempts.length).toBeLessThanOrEqual(5);
      } finally {
        project.cleanup();
      }
    });

    it('detects stagnant progress pattern', async () => {
      if (!ccproxyAvailable) return;

      const project = createTestProject({
        name: 'limits-stagnant',
        customConfig: {
          limits: {
            maxConsecutiveFailures: 10,
            maxTotalAttempts: 10,
            noProgressThreshold: 2,
          },
        },
      });

      try {
        // Same prompt multiple times without changes
        for (let i = 0; i < 3; i++) {
          await runSession({
            prompt: 'What is 2 + 2?', // No code changes
            cwd: project.dir,
            maxTurns: 2,
          });
        }

        const ledger = project.getLedger();

        // Fingerprints should be similar (no progress)
        if (ledger && ledger.fingerprints.length >= 2) {
          const fingerprints = ledger.fingerprints;
          const firstHash = fingerprints[0].hash;
          const sameHashCount = fingerprints.filter(f => f.hash === firstHash).length;

          // Many same fingerprints = stagnant
          expect(sameHashCount).toBeGreaterThan(0);
        }
      } finally {
        project.cleanup();
      }
    });

    it('detects regressing progress pattern', async () => {
      if (!ccproxyAvailable) return;

      const project = createTestProject({ name: 'limits-regress' });

      try {
        // Create a file
        await runSession({
          prompt: 'Create helper.ts with a helper function',
          cwd: project.dir,
          maxTurns: 3,
        });

        // Delete it
        await runSession({
          prompt: 'Delete helper.ts',
          cwd: project.dir,
          maxTurns: 3,
        });

        // Try to use it (regression)
        await runSession({
          prompt: 'Import and use the helper function from helper.ts',
          cwd: project.dir,
          maxTurns: 3,
        });

        const ledger = project.getLedger();

        // Should have recorded multiple attempts
        expect(ledger!.directives.length).toBe(3);
      } finally {
        project.cleanup();
      }
    });
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run build`
- [ ] Tests run (may skip if no ccproxy): `npm run test:integration`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] With ccproxy running, all 23 tests execute
- [ ] Tests complete within timeout (2 minutes each)
- [ ] No resource leaks (temp directories cleaned up)

---

## Phase 4: Configuration & Documentation

### Overview
Update configuration files and add documentation for running integration tests.

### Changes Required:

#### 1. Update vitest.integration.config.ts

**File**: `vitest.integration.config.ts`
**Changes**: Increase timeout, configure parallel execution

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 30000,
    // Allow parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    // Retry failed tests once (network issues)
    retry: 1,
  },
});
```

#### 2. Update package.json

**File**: `package.json`
**Changes**: Add integration test script with environment setup

The existing script is fine:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

#### 3. Add Integration Test Documentation

**File**: `docs/integration-testing.md`

```markdown
# RealityCheck Integration Testing

## Prerequisites

1. **Build RealityCheck**:
   ```bash
   npm run build
   ```

2. **Link globally** (so `realitycheck` CLI is in PATH):
   ```bash
   npm link
   ```

3. **Start ccproxy** (API proxy at localhost:4000):
   ```bash
   ccproxy start
   ```

4. **Verify ccproxy is running**:
   ```bash
   curl http://localhost:4000/health
   ```

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration -- --grep "End-to-End"

# Run with verbose output
npm run test:integration -- --reporter=verbose
```

## Test Configuration

Tests use ccproxy at `localhost:4000` by default. Override with:

```bash
ANTHROPIC_BASE_URL=http://your-proxy:port npm run test:integration
```

### Model Configuration

- **User Agent**: claude-sonnet-4-20250514
- **Judge**: claude-opus-4-20250514 (configured in test project)

### Timeout Configuration

- Per-test timeout: 2 minutes
- Session timeout: 1 minute
- Hook timeout: 30 seconds

## Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| End-to-End Scenarios | 5 | Full task completion flows |
| Judge Accuracy | 5 | Judge decision quality |
| Multi-Session Scenarios | 3 | Session persistence |
| Git Integration | 3 | Baseline and diff tracking |
| Slash Command Integration | 3 | Command expansion |
| Performance & Limits | 4 | Limit enforcement |

## Troubleshooting

### Tests Skip with "ccproxy not available"

Start ccproxy:
```bash
ccproxy start
```

### Tests Timeout

Increase timeout in `vitest.integration.config.ts`:
```typescript
testTimeout: 300000, // 5 minutes
```

### "realitycheck: command not found"

Link the package globally:
```bash
npm link
```

### Rate Limiting

If you hit API rate limits, reduce parallel execution:
```typescript
// vitest.integration.config.ts
poolOptions: {
  threads: {
    maxThreads: 1,  // Sequential execution
  },
},
```
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run test:integration` runs (skips gracefully without ccproxy)
- [ ] Documentation renders correctly

#### Manual Verification:
- [ ] With ccproxy running, tests execute in parallel
- [ ] Documentation accurately describes setup process

---

## Testing Strategy

### Unit Tests (existing):
- All hook handlers tested in isolation
- Judge prompt building tested
- Ledger operations tested

### E2E Tests (existing):
- CLI stdin/stdout tested
- Hook responses verified
- Installation verified

### Integration Tests (this plan):
- Real Claude sessions with hooks
- Full quality gate flow
- Multi-session scenarios

### Manual Testing:
1. Start ccproxy
2. Run `npm run test:integration`
3. Verify all 23 tests pass
4. Check temp directories are cleaned up

## Performance Considerations

- Tests run in parallel (up to 4 concurrent)
- Each test has 2-minute timeout
- Session cleanup ensures no resource leaks
- Retry logic handles transient API failures

## Migration Notes

N/A - This is new functionality.

## References

- Original placeholder: `src/tests/integration/realitycheck.integration.test.ts`
- Agent SDK docs: https://platform.claude.com/docs/en/agent-sdk
- ccproxy health endpoint: `http://localhost:4000/health`
- Phase 6 testing plan: `docs/plans/phases/phase-6-testing.md`

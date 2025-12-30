import { describe, it, expect } from 'vitest';
import {
  JudgeVerdictSchema,
  buildJudgePrompt,
} from './index.js';
import { Directive, StopAttempt } from '../types/index.js';
import { GitDiff } from '../git/index.js';

// =============================================================================
// Schema Tests
// =============================================================================

describe('JudgeVerdictSchema', () => {
  it('should validate a complete verdict', () => {
    const verdict = {
      pass: true,
      reason: 'All tasks completed',
      missingItems: [],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    };

    const result = JudgeVerdictSchema.safeParse(verdict);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pass).toBe(true);
    }
  });

  it('should validate a verdict with optional convergenceEstimate', () => {
    const verdict = {
      pass: false,
      reason: 'Task incomplete',
      missingItems: ['Write tests'],
      questionsForUser: ['What test framework?'],
      forwardProgress: true,
      convergenceEstimate: 75,
      suggestedNextSteps: ['Add unit tests', 'Run npm test'],
    };

    const result = JudgeVerdictSchema.safeParse(verdict);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.convergenceEstimate).toBe(75);
    }
  });

  it('should reject verdict with missing required fields', () => {
    const invalidVerdict = {
      pass: true,
      reason: 'Done',
      // Missing missingItems, questionsForUser, forwardProgress, suggestedNextSteps
    };

    const result = JudgeVerdictSchema.safeParse(invalidVerdict);
    expect(result.success).toBe(false);
  });

  it('should reject verdict with wrong types', () => {
    const invalidVerdict = {
      pass: 'yes', // Should be boolean
      reason: 123, // Should be string
      missingItems: 'item1', // Should be array
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    };

    const result = JudgeVerdictSchema.safeParse(invalidVerdict);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Prompt Builder Tests
// =============================================================================

describe('buildJudgePrompt', () => {
  const createDirective = (overrides: Partial<Directive> = {}): Directive => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    rawText: 'Create a login page',
    type: 'initial',
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  const createStopAttempt = (overrides: Partial<StopAttempt> = {}): StopAttempt => ({
    id: '123e4567-e89b-12d3-a456-426614174001',
    timestamp: '2024-01-01T00:00:00.000Z',
    verdict: 'incomplete',
    reason: 'Missing error handling',
    ...overrides,
  });

  const createDiff = (overrides: Partial<GitDiff> = {}): GitDiff => ({
    files: [
      { path: 'src/login.ts', status: 'added', additions: 50, deletions: 0 },
    ],
    summary: '1 file changed, 50 insertions(+)',
    patch: 'diff --git a/src/login.ts b/src/login.ts\n+export function login() {}',
    ...overrides,
  });

  it('should include active directives section', () => {
    const directives = [createDirective()];
    const prompt = buildJudgePrompt(directives, null, undefined, [], 'abc123');

    expect(prompt).toContain('## Active Directives');
    expect(prompt).toContain('[INITIAL] Create a login page');
  });

  it('should include normalized intent if present', () => {
    const directives = [
      createDirective({
        rawText: 'Fix that bug',
        normalizedIntent: 'Fix authentication token refresh bug',
      }),
    ];
    const prompt = buildJudgePrompt(directives, null, undefined, [], 'abc123');

    expect(prompt).toContain('Intent: Fix authentication token refresh bug');
  });

  it('should handle empty directives', () => {
    const prompt = buildJudgePrompt([], null, undefined, [], 'abc123');

    expect(prompt).toContain('No active directives.');
  });

  it('should include diff summary', () => {
    const diff = createDiff();
    const prompt = buildJudgePrompt([], diff, undefined, [], 'abc123');

    expect(prompt).toContain('## Changes Made');
    expect(prompt).toContain('1 files changed');
    expect(prompt).toContain('src/login.ts');
    expect(prompt).toContain('+50/-0');
  });

  it('should include patch if under 10KB', () => {
    const diff = createDiff({
      patch: 'diff --git a/file.ts b/file.ts\n+new line',
    });
    const prompt = buildJudgePrompt([], diff, undefined, [], 'abc123');

    expect(prompt).toContain('```diff');
    expect(prompt).toContain('diff --git a/file.ts b/file.ts');
  });

  it('should skip patch if over 10KB', () => {
    const largePatch = 'x'.repeat(15000);
    const diff = createDiff({ patch: largePatch });
    const prompt = buildJudgePrompt([], diff, undefined, [], 'abc123');

    expect(prompt).toContain('Patch too large');
    expect(prompt).not.toContain('xxxxxxx');
  });

  it('should handle no git diff', () => {
    const prompt = buildJudgePrompt([], null, undefined, [], 'abc123');

    expect(prompt).toContain('No git diff available');
  });

  it('should include agent last message', () => {
    const lastMessage = 'I have completed the login page implementation.';
    const prompt = buildJudgePrompt([], null, lastMessage, [], 'abc123');

    expect(prompt).toContain("## Agent's Final Message");
    expect(prompt).toContain('I have completed the login page implementation.');
  });

  it('should truncate long messages to 2000 chars', () => {
    const longMessage = 'A'.repeat(3000);
    const prompt = buildJudgePrompt([], null, longMessage, [], 'abc123');

    expect(prompt).toContain('A'.repeat(2000));
    expect(prompt).toContain('... (truncated)');
    expect(prompt).not.toContain('A'.repeat(2001));
  });

  it('should include previous stop attempts', () => {
    const attempts = [
      createStopAttempt({ verdict: 'incomplete', reason: 'Missing tests' }),
      createStopAttempt({ verdict: 'incomplete', reason: 'Type errors' }),
    ];
    const prompt = buildJudgePrompt([], null, undefined, attempts, 'abc123');

    expect(prompt).toContain('## Previous Stop Attempts');
    expect(prompt).toContain('Missing tests');
    expect(prompt).toContain('Type errors');
  });

  it('should show only last 5 attempts when there are many', () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      createStopAttempt({ reason: `Attempt ${i + 1}` })
    );
    const prompt = buildJudgePrompt([], null, undefined, attempts, 'abc123');

    expect(prompt).toContain('Showing last 5 of 10 attempts');
    expect(prompt).toContain('Attempt 10');
    expect(prompt).toContain('Attempt 6');
    expect(prompt).not.toContain('Attempt 5');
  });

  it('should indicate fingerprint changes', () => {
    const attempts = [
      createStopAttempt({
        fingerprintBefore: 'hash1',
        fingerprintAfter: 'hash2',
      }),
    ];
    const prompt = buildJudgePrompt([], null, undefined, attempts, 'abc123');

    expect(prompt).toContain('Fingerprint: CHANGED');
  });

  it('should include current fingerprint', () => {
    const prompt = buildJudgePrompt([], null, undefined, [], 'currenthash123');

    expect(prompt).toContain('## Current Workspace Fingerprint');
    expect(prompt).toContain('Hash: currenthash123');
  });

  it('should include evaluation task instructions', () => {
    const prompt = buildJudgePrompt([], null, undefined, [], 'abc123');

    expect(prompt).toContain('## Your Task');
    expect(prompt).toContain('Evaluate whether all active directives');
  });
});

// =============================================================================
// runJudge Integration Notes
// =============================================================================

// The runJudge function spawns a Claude subprocess and cannot be easily unit tested.
// These behaviors should be verified through integration testing:
//
// 1. Returns parsed verdict from subprocess
// 2. Handles verdict with content blocks format
// 3. Handles verdict with result field
// 4. Fails open on subprocess error (returns pass=true)
// 5. Fails open on invalid JSON response (returns pass=true)
// 6. Fails open on invalid verdict schema (returns pass=true)
// 7. Fails open on non-zero exit code (returns pass=true)
// 8. Passes correct arguments to claude subprocess
// 9. Respects timeout configuration
//
// Run manual integration tests with:
// npm run test:integration

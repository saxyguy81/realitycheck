/**
 * E2E Tests for Judge Module (Phase 4 verification)
 *
 * These tests verify the judge prompt building and verdict schema.
 * Actual Claude subprocess tests are integration tests (require real Claude CLI).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  JudgeVerdictSchema,
  buildJudgePrompt,
  runJudge,
} from '../../judge/index.js';
import { Directive, StopAttempt } from '../../types/index.js';
import { GitDiff } from '../../git/index.js';

// Mock child_process for subprocess tests
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

describe('Judge E2E Tests', () => {
  describe('Verdict Schema Validation', () => {
    it('validates correct complete verdict', () => {
      const verdict = {
        pass: true,
        reason: 'All tasks completed successfully',
        missingItems: [],
        questionsForUser: [],
        forwardProgress: true,
        suggestedNextSteps: [],
      };

      const result = JudgeVerdictSchema.safeParse(verdict);

      expect(result.success).toBe(true);
    });

    it('validates verdict with optional convergenceEstimate', () => {
      const verdict = {
        pass: false,
        reason: 'Partial completion',
        missingItems: ['Tests needed'],
        questionsForUser: [],
        forwardProgress: true,
        convergenceEstimate: 75,
        suggestedNextSteps: ['Add tests'],
      };

      const result = JudgeVerdictSchema.safeParse(verdict);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convergenceEstimate).toBe(75);
      }
    });

    it('rejects verdict with missing required fields', () => {
      const invalidVerdict = {
        pass: true,
        // Missing: reason, missingItems, questionsForUser, forwardProgress, suggestedNextSteps
      };

      const result = JudgeVerdictSchema.safeParse(invalidVerdict);

      expect(result.success).toBe(false);
    });

    it('rejects verdict with wrong types', () => {
      const invalidVerdict = {
        pass: 'yes', // Should be boolean
        reason: 123, // Should be string
        missingItems: 'item', // Should be array
        questionsForUser: [],
        forwardProgress: true,
        suggestedNextSteps: [],
      };

      const result = JudgeVerdictSchema.safeParse(invalidVerdict);

      expect(result.success).toBe(false);
    });

    it('validates verdict with empty arrays', () => {
      const verdict = {
        pass: true,
        reason: 'Done',
        missingItems: [],
        questionsForUser: [],
        forwardProgress: false,
        suggestedNextSteps: [],
      };

      const result = JudgeVerdictSchema.safeParse(verdict);

      expect(result.success).toBe(true);
    });

    it('validates verdict with populated arrays', () => {
      const verdict = {
        pass: false,
        reason: 'Multiple issues',
        missingItems: ['Tests', 'Documentation', 'Error handling'],
        questionsForUser: ['What database to use?', 'Which auth provider?'],
        forwardProgress: true,
        convergenceEstimate: 50,
        suggestedNextSteps: ['Add unit tests', 'Write docs', 'Handle edge cases'],
      };

      const result = JudgeVerdictSchema.safeParse(verdict);

      expect(result.success).toBe(true);
    });
  });

  describe('Prompt Builder', () => {
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

    it('includes all directive types in prompt', () => {
      const directives = [
        createDirective({ type: 'initial', rawText: 'Build feature' }),
        createDirective({ type: 'followup', rawText: 'Add tests' }),
        createDirective({ type: 'clarification', rawText: 'Use Jest' }),
      ];

      const prompt = buildJudgePrompt(directives, null, undefined, [], 'hash123');

      expect(prompt).toContain('[INITIAL] Build feature');
      expect(prompt).toContain('[FOLLOWUP] Add tests');
      expect(prompt).toContain('[CLARIFICATION] Use Jest');
    });

    it('includes diff summary in prompt', () => {
      const diff = createDiff({
        files: [
          { path: 'src/a.ts', status: 'added', additions: 100, deletions: 0 },
          { path: 'src/b.ts', status: 'modified', additions: 50, deletions: 20 },
        ],
      });

      const prompt = buildJudgePrompt([], diff, undefined, [], 'hash123');

      expect(prompt).toContain('2 files changed');
      expect(prompt).toContain('src/a.ts');
      expect(prompt).toContain('src/b.ts');
      expect(prompt).toContain('+100/-0');
      expect(prompt).toContain('+50/-20');
    });

    it('truncates large diffs', () => {
      const largePatch = 'x'.repeat(15000);
      const diff = createDiff({ patch: largePatch });

      const prompt = buildJudgePrompt([], diff, undefined, [], 'hash123');

      expect(prompt).toContain('Patch too large');
      expect(prompt).not.toContain(largePatch);
    });

    it('includes stop attempt history', () => {
      const attempts = [
        createStopAttempt({ reason: 'Missing tests', verdict: 'incomplete' }),
        createStopAttempt({ reason: 'Type errors', verdict: 'incomplete' }),
        createStopAttempt({ reason: 'All done', verdict: 'complete' }),
      ];

      const prompt = buildJudgePrompt([], null, undefined, attempts, 'hash123');

      expect(prompt).toContain('Missing tests');
      expect(prompt).toContain('Type errors');
      expect(prompt).toContain('All done');
      expect(prompt).toContain('INCOMPLETE');
      expect(prompt).toContain('COMPLETE');
    });

    it('includes fingerprint change status', () => {
      const attempts = [
        createStopAttempt({
          fingerprintBefore: 'hash1',
          fingerprintAfter: 'hash2',
        }),
      ];

      const prompt = buildJudgePrompt([], null, undefined, attempts, 'hash123');

      expect(prompt).toContain('Fingerprint: CHANGED');
    });

    it('includes agent last message', () => {
      const lastMessage = 'I completed the login implementation with OAuth support.';

      const prompt = buildJudgePrompt([], null, lastMessage, [], 'hash123');

      expect(prompt).toContain("Agent's Final Message");
      expect(prompt).toContain('I completed the login implementation');
    });

    it('truncates long agent messages', () => {
      const longMessage = 'A'.repeat(3000);

      const prompt = buildJudgePrompt([], null, longMessage, [], 'hash123');

      expect(prompt).toContain('... (truncated)');
      expect(prompt).not.toContain('A'.repeat(2500));
    });

    it('handles empty directives gracefully', () => {
      const prompt = buildJudgePrompt([], null, undefined, [], 'hash123');

      expect(prompt).toContain('No active directives');
    });

    it('handles no git diff gracefully', () => {
      const prompt = buildJudgePrompt([], null, undefined, [], 'hash123');

      expect(prompt).toContain('No git diff available');
    });

    it('includes evaluation instructions', () => {
      const prompt = buildJudgePrompt([], null, undefined, [], 'hash123');

      expect(prompt).toContain('Your Task');
      expect(prompt).toContain('Evaluate whether all active directives');
    });
  });

  describe('runJudge Error Handling', () => {
    it('returns fail-open verdict on subprocess error', async () => {
      const { spawn } = await import('child_process');

      // Mock spawn to simulate error
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const mockProcess = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          stdin: { write: vi.fn(), end: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              callback(new Error('Spawn failed'));
            }
          }),
          kill: vi.fn(),
        };
        return mockProcess;
      });

      const result = await runJudge({
        config: {
          enabled: true,
          judge: { model: 'haiku', timeout: 30000 },
          limits: { maxConsecutiveFailures: 5, maxTotalAttempts: 10, noProgressThreshold: 3 },
          storage: { location: '.claude/realitycheck', archiveCorrupted: true },
          git: { enabled: true, includeDiff: true, captureBaseline: true },
          performance: { fingerprintOnToolUse: true },
        },
        directives: [],
        diff: null,
        fingerprint: 'hash123',
        stopAttempts: [],
        projectDir: '/tmp/test',
      });

      // Should fail open
      expect(result.pass).toBe(true);
      expect(result.reason).toContain('failed');
    });
  });
});

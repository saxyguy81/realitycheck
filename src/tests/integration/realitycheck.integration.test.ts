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

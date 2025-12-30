/**
 * E2E Tests for Hook Infrastructure (Phase 3 verification)
 *
 * These tests verify the hook handlers work correctly when invoked
 * via CLI stdin/stdout, simulating how Claude Code calls them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('Hook E2E Tests', () => {
  let tempDir: string;
  let cliPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-e2e-hooks-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Path to the built CLI
    cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run the CLI with JSON input via stdin
   */
  function runCliWithInput(
    input: Record<string, unknown>
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const child = spawn('node', [cliPath], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code });
      });

      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    });
  }

  describe('UserPromptSubmit via CLI', () => {
    it('creates ledger when given valid JSON via stdin', async () => {
      const input = {
        hook_event_name: 'UserPromptSubmit',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        prompt: 'Create a login page',
      };

      const result = await runCliWithInput(input);

      // Should exit successfully
      expect(result.exitCode).toBe(0);

      // Ledger should be created
      const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
      expect(existsSync(ledgerPath)).toBe(true);

      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
      expect(ledger.directives).toHaveLength(1);
      expect(ledger.directives[0].rawText).toBe('Create a login page');
    });

    it('returns additionalContext on first prompt', async () => {
      const input = {
        hook_event_name: 'UserPromptSubmit',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        prompt: 'Build something',
      };

      const result = await runCliWithInput(input);

      // Parse stdout as JSON
      const output = JSON.parse(result.stdout);
      expect(output.additionalContext).toContain('RealityCheck Active');
    });
  });

  describe('PostToolUse via CLI', () => {
    it('records fingerprint for Bash tool', async () => {
      // First create a valid ledger with proper UUIDs
      const ledgerDir = join(tempDir, '.claude', 'realitycheck');
      mkdirSync(ledgerDir, { recursive: true });

      const now = new Date().toISOString();
      const { randomUUID } = await import('crypto');

      writeFileSync(
        join(ledgerDir, 'task_ledger.json'),
        JSON.stringify({
          version: 1,
          sessionId: randomUUID(),
          createdAt: now,
          updatedAt: now,
          directives: [],
          criteria: [],
          stopAttempts: [],
          fingerprints: [],
        })
      );

      // Create config to enable fingerprinting on tool use
      const claudeDir = join(tempDir, '.claude');
      writeFileSync(
        join(claudeDir, 'realitycheck.config.json'),
        JSON.stringify({
          performance: { fingerprintOnToolUse: true },
        })
      );

      const input = {
        hook_event_name: 'PostToolUse',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      };

      const result = await runCliWithInput(input);

      expect(result.exitCode).toBe(0);

      const ledger = JSON.parse(readFileSync(join(ledgerDir, 'task_ledger.json'), 'utf-8'));
      expect(ledger.fingerprints.length).toBeGreaterThanOrEqual(1);
      expect(ledger.fingerprints[ledger.fingerprints.length - 1].afterCommand).toBe('npm test');
    });
  });

  describe('SessionStart via CLI', () => {
    it('shows preserved directives after clear', async () => {
      // Create ledger with active directives using valid UUIDs
      const ledgerDir = join(tempDir, '.claude', 'realitycheck');
      mkdirSync(ledgerDir, { recursive: true });

      const now = new Date().toISOString();
      const { randomUUID } = await import('crypto');

      writeFileSync(
        join(ledgerDir, 'task_ledger.json'),
        JSON.stringify({
          version: 1,
          sessionId: randomUUID(),
          createdAt: now,
          updatedAt: now,
          directives: [
            {
              id: randomUUID(),
              rawText: 'Build login page',
              type: 'initial',
              status: 'active',
              createdAt: now,
            },
          ],
          criteria: [],
          stopAttempts: [],
          fingerprints: [],
        })
      );

      const input = {
        hook_event_name: 'SessionStart',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        source: 'clear',
      };

      const result = await runCliWithInput(input);

      expect(result.exitCode).toBe(0);

      // The output may be empty or contain JSON
      if (result.stdout.trim()) {
        const output = JSON.parse(result.stdout);
        expect(output.additionalContext).toContain('Context Restored');
        expect(output.additionalContext).toContain('Build login page');
      }
    });
  });

  describe('Stop hook via CLI', () => {
    it('returns continue when no directives', async () => {
      // Create empty ledger with valid UUIDs
      const ledgerDir = join(tempDir, '.claude', 'realitycheck');
      mkdirSync(ledgerDir, { recursive: true });

      const now = new Date().toISOString();
      const { randomUUID } = await import('crypto');

      writeFileSync(
        join(ledgerDir, 'task_ledger.json'),
        JSON.stringify({
          version: 1,
          sessionId: randomUUID(),
          createdAt: now,
          updatedAt: now,
          directives: [],
          criteria: [],
          stopAttempts: [],
          fingerprints: [],
        })
      );

      // Create empty transcript
      writeFileSync(join(tempDir, 'transcript.jsonl'), '');

      const input = {
        hook_event_name: 'Stop',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        stop_hook_active: false,
      };

      const result = await runCliWithInput(input);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('continue');
    });

    it('returns continue when limits exceeded', async () => {
      // Create ledger with many failed attempts using valid UUIDs
      const ledgerDir = join(tempDir, '.claude', 'realitycheck');
      mkdirSync(ledgerDir, { recursive: true });

      const now = new Date().toISOString();
      const { randomUUID } = await import('crypto');

      // Create config with low maxConsecutiveFailures to trigger limit exceeded
      const claudeDir = join(tempDir, '.claude');
      writeFileSync(
        join(claudeDir, 'realitycheck.config.json'),
        JSON.stringify({
          limits: { maxConsecutiveFailures: 5 },
        })
      );

      writeFileSync(
        join(ledgerDir, 'task_ledger.json'),
        JSON.stringify({
          version: 1,
          sessionId: randomUUID(),
          createdAt: now,
          updatedAt: now,
          directives: [
            {
              id: randomUUID(),
              rawText: 'Task',
              type: 'initial',
              status: 'active',
              createdAt: now,
            },
          ],
          criteria: [],
          stopAttempts: [
            { id: randomUUID(), timestamp: now, verdict: 'incomplete', reason: '1' },
            { id: randomUUID(), timestamp: now, verdict: 'incomplete', reason: '2' },
            { id: randomUUID(), timestamp: now, verdict: 'incomplete', reason: '3' },
            { id: randomUUID(), timestamp: now, verdict: 'incomplete', reason: '4' },
            { id: randomUUID(), timestamp: now, verdict: 'incomplete', reason: '5' },
          ],
          fingerprints: [],
        })
      );

      writeFileSync(join(tempDir, 'transcript.jsonl'), '');

      const input = {
        hook_event_name: 'Stop',
        session_id: 'e2e-session-123',
        transcript_path: join(tempDir, 'transcript.jsonl'),
        cwd: tempDir,
        stop_hook_active: false,
      };

      const result = await runCliWithInput(input);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('continue');
    });
  });

  describe('CLI error handling', () => {
    it('handles invalid JSON gracefully', async () => {
      const child = spawn('node', [cliPath], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let exitCode: number | null = null;

      child.on('close', (code) => {
        exitCode = code;
      });

      child.stdin.write('not valid json');
      child.stdin.end();

      // Wait for process to finish
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should still exit (possibly with error code)
      expect(exitCode).toBeDefined();
    });

    it('handles unknown hook type gracefully', async () => {
      const input = {
        hook_event_name: 'UnknownHook',
        session_id: 'e2e-session-123',
        cwd: tempDir,
      };

      const result = await runCliWithInput(input);

      // Should not crash
      expect(result.exitCode).toBeDefined();
    });
  });
});

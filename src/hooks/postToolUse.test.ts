import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { handlePostToolUse } from './postToolUse.js';

describe('handlePostToolUse', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-posttool-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createInput = (overrides: Record<string, unknown> = {}) => ({
    hook_event_name: 'PostToolUse',
    session_id: 'test-session-123',
    transcript_path: join(tempDir, 'transcript.jsonl'),
    cwd: tempDir,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_output: { stdout: 'All tests passed', exitCode: 0 },
    ...overrides,
  });

  const initializeLedger = async () => {
    // Need to pre-create ledger since PostToolUse expects it to exist
    const ledgerDir = join(tempDir, '.claude', 'realitycheck');
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(
      join(ledgerDir, 'task_ledger.json'),
      JSON.stringify({
        version: 1,
        sessionId: 'test-session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        directives: [],
        criteria: [],
        stopAttempts: [],
        fingerprints: [],
      })
    );
  };

  /**
   * Create a config file that enables fingerprinting on tool use
   */
  const createConfigWithFingerprinting = () => {
    writeFileSync(
      join(tempDir, 'realitycheck.config.json'),
      JSON.stringify({
        performance: {
          fingerprintOnToolUse: true,
        },
      })
    );
  };

  it('ignores non-Bash tools', async () => {
    await initializeLedger();

    const result = await handlePostToolUse(
      createInput({ tool_name: 'Write' })
    );

    expect(result).toBeUndefined();

    // Verify no fingerprint was recorded
    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
    expect(ledger.fingerprints).toHaveLength(0);
  });

  it('ignores Read tools', async () => {
    await initializeLedger();

    const result = await handlePostToolUse(
      createInput({ tool_name: 'Read' })
    );

    expect(result).toBeUndefined();
  });

  it('records fingerprint for Bash tools when enabled in config', async () => {
    createConfigWithFingerprinting();
    await initializeLedger();

    const input = createInput({
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
    });

    await handlePostToolUse(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.fingerprints).toHaveLength(1);
    expect(ledger.fingerprints[0].hash).toHaveLength(16);
    expect(ledger.fingerprints[0].afterCommand).toBe('npm install');
  });

  it('does not record fingerprint when fingerprintOnToolUse is false (default)', async () => {
    await initializeLedger();

    const input = createInput({
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
    });

    await handlePostToolUse(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    // Default config has fingerprintOnToolUse: false
    expect(ledger.fingerprints).toHaveLength(0);
  });

  it('records fingerprint for Bash in git repo when enabled', async () => {
    // Initialize git repo
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
    writeFileSync(join(tempDir, 'test.txt'), 'content');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    createConfigWithFingerprinting();
    await initializeLedger();

    await handlePostToolUse(createInput());

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.fingerprints).toHaveLength(1);
    expect(ledger.fingerprints[0].hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('returns undefined (no blocking)', async () => {
    await initializeLedger();

    const result = await handlePostToolUse(createInput());

    expect(result).toBeUndefined();
  });

  it('handles missing tool_input gracefully', async () => {
    await initializeLedger();

    const input = createInput({ tool_input: undefined });

    const result = await handlePostToolUse(input);

    expect(result).toBeUndefined();
  });

  it('extracts command from cmd field when fingerprinting enabled', async () => {
    createConfigWithFingerprinting();
    await initializeLedger();

    const input = createInput({
      tool_input: { cmd: 'npm run build' },
    });

    await handlePostToolUse(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.fingerprints[0].afterCommand).toBe('npm run build');
  });

  it('silently fails on invalid input', async () => {
    const result = await handlePostToolUse({ invalid: 'data' });

    expect(result).toBeUndefined();
  });

  it('handles multiple sequential tool calls when fingerprinting enabled', async () => {
    createConfigWithFingerprinting();
    await initializeLedger();

    await handlePostToolUse(createInput({ tool_input: { command: 'npm test' } }));
    await handlePostToolUse(createInput({ tool_input: { command: 'npm build' } }));

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.fingerprints).toHaveLength(2);
    expect(ledger.fingerprints[0].afterCommand).toBe('npm test');
    expect(ledger.fingerprints[1].afterCommand).toBe('npm build');
  });
});

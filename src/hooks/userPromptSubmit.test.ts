import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { handleUserPromptSubmit } from './userPromptSubmit.js';

describe('handleUserPromptSubmit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-userprompt-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createInput = (overrides: Record<string, unknown> = {}) => ({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-123',
    transcript_path: join(tempDir, 'transcript.jsonl'),
    cwd: tempDir,
    prompt: 'Create a hello world function',
    ...overrides,
  });

  it('creates ledger on first prompt', async () => {
    const input = createInput();

    await handleUserPromptSubmit(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    expect(existsSync(ledgerPath)).toBe(true);
  });

  it('adds directive with correct type', async () => {
    const input = createInput({ prompt: 'Build a login page' });

    await handleUserPromptSubmit(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives).toHaveLength(1);
    expect(ledger.directives[0].rawText).toBe('Build a login page');
    expect(ledger.directives[0].type).toBe('initial');
    expect(ledger.directives[0].status).toBe('active');
  });

  it('marks subsequent prompts as followup type', async () => {
    // First prompt
    await handleUserPromptSubmit(createInput({ prompt: 'First task' }));

    // Second prompt
    await handleUserPromptSubmit(createInput({ prompt: 'Second task' }));

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives).toHaveLength(2);
    expect(ledger.directives[0].type).toBe('initial');
    expect(ledger.directives[1].type).toBe('followup');
  });

  it('marks questions as clarification type', async () => {
    // First prompt
    await handleUserPromptSubmit(createInput({ prompt: 'First task' }));

    // Question prompt
    await handleUserPromptSubmit(createInput({ prompt: 'What framework should I use?' }));

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives).toHaveLength(2);
    expect(ledger.directives[1].type).toBe('clarification');
  });

  it('injects RealityCheck context on first prompt', async () => {
    const input = createInput();

    const result = await handleUserPromptSubmit(input);

    expect(result).toBeDefined();
    expect(result?.additionalContext).toContain('RealityCheck Active');
    expect(result?.additionalContext).toContain('quality gate');
  });

  it('does not inject context on subsequent prompts', async () => {
    // First prompt
    await handleUserPromptSubmit(createInput({ prompt: 'First' }));

    // Second prompt
    const result = await handleUserPromptSubmit(createInput({ prompt: 'Second' }));

    expect(result).toBeUndefined();
  });

  it('handles slash command expansion', async () => {
    // Create a slash command
    const commandsDir = join(tempDir, '.claude', 'commands');
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(
      join(commandsDir, 'greet.md'),
      '# Greeting Command\n\nSay hello to $ARGUMENTS'
    );

    const input = createInput({ prompt: '/greet world' });

    await handleUserPromptSubmit(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives[0].rawText).toContain('Say hello to world');
    expect(ledger.directives[0].normalizedIntent).toBe('Greeting Command');
  });

  it('returns undefined for invalid input', async () => {
    const result = await handleUserPromptSubmit({ invalid: 'data' });

    expect(result).toBeUndefined();
  });

  it('creates git baseline on first prompt in git repo', async () => {
    // Initialize git repo
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
    writeFileSync(join(tempDir, 'test.txt'), 'content');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    const input = createInput();

    await handleUserPromptSubmit(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.gitBaseline).toBeDefined();
    expect(ledger.gitBaseline.branch).toBe('main');
    expect(ledger.gitBaseline.commitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(ledger.fingerprints).toHaveLength(1);
  });

  it('handles correction patterns as followup', async () => {
    // First prompt
    await handleUserPromptSubmit(createInput({ prompt: 'Build feature X' }));

    // Correction prompt
    await handleUserPromptSubmit(createInput({ prompt: 'Actually, build feature Y instead' }));

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives).toHaveLength(2);
    expect(ledger.directives[1].type).toBe('followup');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { handleSessionStart } from './sessionStart.js';

describe('handleSessionStart', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-sessionstart-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createInput = (overrides: Record<string, unknown> = {}) => ({
    hook_event_name: 'SessionStart',
    session_id: 'test-session-123',
    transcript_path: join(tempDir, 'transcript.jsonl'),
    cwd: tempDir,
    source: 'startup',
    ...overrides,
  });

  const createLedgerWithDirectives = (
    directives: Array<{
      rawText: string;
      type: 'initial' | 'followup' | 'clarification';
      status: 'active' | 'completed' | 'superseded' | 'abandoned';
      normalizedIntent?: string;
    }>
  ) => {
    const ledgerDir = join(tempDir, '.claude', 'realitycheck');
    mkdirSync(ledgerDir, { recursive: true });

    const now = new Date().toISOString();

    const ledger = {
      version: 1,
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      directives: directives.map((d) => ({
        id: randomUUID(),
        rawText: d.rawText,
        normalizedIntent: d.normalizedIntent,
        type: d.type,
        status: d.status,
        createdAt: now,
      })),
      criteria: [],
      stopAttempts: [],
      fingerprints: [],
    };

    writeFileSync(join(ledgerDir, 'task_ledger.json'), JSON.stringify(ledger));
    return ledger;
  };

  it('initializes ledger on startup', async () => {
    const input = createInput({ source: 'startup' });

    await handleSessionStart(input);

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.version).toBe(1);
    expect(ledger.sessionId).toBeDefined();
  });

  it('injects directive reminder on clear when directives exist', async () => {
    createLedgerWithDirectives([
      { rawText: 'Build login page', type: 'initial', status: 'active' },
      { rawText: 'Add tests', type: 'followup', status: 'active' },
    ]);

    const input = createInput({ source: 'clear' });

    const result = await handleSessionStart(input);

    expect(result).toBeDefined();
    expect(result?.additionalContext).toContain('RealityCheck Context Restored');
    expect(result?.additionalContext).toContain('Build login page');
    expect(result?.additionalContext).toContain('Add tests');
  });

  it('uses normalizedIntent if available', async () => {
    createLedgerWithDirectives([
      {
        rawText: '/build login',
        type: 'initial',
        status: 'active',
        normalizedIntent: 'Build a login page with OAuth',
      },
    ]);

    const input = createInput({ source: 'clear' });

    const result = await handleSessionStart(input);

    expect(result?.additionalContext).toContain('Build a login page with OAuth');
  });

  it('returns undefined on clear when no active directives', async () => {
    createLedgerWithDirectives([
      { rawText: 'Completed task', type: 'initial', status: 'completed' },
    ]);

    const input = createInput({ source: 'clear' });

    const result = await handleSessionStart(input);

    expect(result).toBeUndefined();
  });

  it('returns undefined on normal startup', async () => {
    const input = createInput({ source: 'startup' });

    const result = await handleSessionStart(input);

    expect(result).toBeUndefined();
  });

  it('provides status update on resume with pending directives and stop attempts', async () => {
    const ledgerDir = join(tempDir, '.claude', 'realitycheck');
    mkdirSync(ledgerDir, { recursive: true });

    const now = new Date().toISOString();

    const ledger = {
      version: 1,
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      directives: [
        {
          id: randomUUID(),
          rawText: 'Build feature X',
          type: 'initial',
          status: 'active',
          createdAt: now,
        },
      ],
      criteria: [],
      stopAttempts: [
        {
          id: randomUUID(),
          timestamp: now,
          verdict: 'incomplete',
          reason: 'Tests not passing',
        },
      ],
      fingerprints: [],
    };

    writeFileSync(join(ledgerDir, 'task_ledger.json'), JSON.stringify(ledger));

    const input = createInput({ source: 'resume' });

    const result = await handleSessionStart(input);

    expect(result).toBeDefined();
    expect(result?.additionalContext).toContain('Session Resumed');
    expect(result?.additionalContext).toContain('1 active directive(s)');
    expect(result?.additionalContext).toContain('1 stop attempt(s)');
    expect(result?.additionalContext).toContain('incomplete');
    expect(result?.additionalContext).toContain('Tests not passing');
  });

  it('returns undefined on resume with no prior work', async () => {
    const input = createInput({ source: 'resume' });

    const result = await handleSessionStart(input);

    expect(result).toBeUndefined();
  });

  it('handles invalid input gracefully', async () => {
    const result = await handleSessionStart({ invalid: 'data' });

    expect(result).toBeUndefined();
  });

  it('handles compact source without special output', async () => {
    createLedgerWithDirectives([
      { rawText: 'Active task', type: 'initial', status: 'active' },
    ]);

    const input = createInput({ source: 'compact' });

    const result = await handleSessionStart(input);

    expect(result).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Mock the judge module BEFORE importing handleStop
vi.mock('../judge/index.js', () => ({
  runJudge: vi.fn().mockResolvedValue({
    pass: true,
    reason: 'All done',
    missingItems: [],
    questionsForUser: [],
    forwardProgress: true,
    suggestedNextSteps: [],
  }),
  JudgeVerdictSchema: {
    safeParse: vi.fn(),
  },
  buildJudgePrompt: vi.fn(),
}));

// Import after mocking
import { handleStop } from './stop.js';
import * as judgeModule from '../judge/index.js';

describe('handleStop', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-stop-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const createInput = (overrides: Record<string, unknown> = {}) => ({
    hook_event_name: 'Stop',
    session_id: 'test-session-123',
    transcript_path: join(tempDir, 'transcript.jsonl'),
    cwd: tempDir,
    stop_hook_active: false,
    ...overrides,
  });

  /**
   * Create a valid ledger that matches the TaskLedgerSchema
   */
  const createValidLedger = (
    options: {
      directives?: Array<{
        rawText: string;
        type: 'initial' | 'followup' | 'clarification';
        status: 'active' | 'completed' | 'superseded' | 'abandoned';
      }>;
      stopAttempts?: Array<{
        verdict: 'complete' | 'incomplete' | 'blocked' | 'error';
        reason: string;
      }>;
      fingerprints?: Array<{ hash: string }>;
    } = {}
  ) => {
    const ledgerDir = join(tempDir, '.claude', 'realitycheck');
    mkdirSync(ledgerDir, { recursive: true });

    const now = new Date().toISOString();

    const ledger = {
      version: 1,
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      directives: (options.directives || []).map((d) => ({
        id: randomUUID(),
        rawText: d.rawText,
        type: d.type,
        status: d.status,
        createdAt: now,
      })),
      criteria: [],
      stopAttempts: (options.stopAttempts || []).map((a) => ({
        id: randomUUID(),
        timestamp: now,
        verdict: a.verdict,
        reason: a.reason,
      })),
      fingerprints: (options.fingerprints || []).map((f) => ({
        hash: f.hash,
        timestamp: now,
      })),
    };

    writeFileSync(join(ledgerDir, 'task_ledger.json'), JSON.stringify(ledger));
    return ledger;
  };

  const createTranscript = (messages: Array<{ role: string; content: string }> = []) => {
    const transcriptPath = join(tempDir, 'transcript.jsonl');
    const lines = messages.map((m) =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message: {
          role: m.role,
          content: [{ type: 'text', text: m.content }],
        },
      })
    );
    writeFileSync(transcriptPath, lines.join('\n'));
  };

  it('allows stop when no directives', async () => {
    createValidLedger({ directives: [] });
    createTranscript();

    const result = await handleStop(createInput());

    expect(result).toEqual({ decision: 'continue' });
  });

  it('allows stop when maxConsecutiveFailures limit exceeded (default: 20)', async () => {
    // Default maxConsecutiveFailures is 20, so we need 20 failures
    const stopAttempts = Array.from({ length: 20 }, (_, i) => ({
      verdict: 'incomplete' as const,
      reason: `Failure ${i + 1}`,
    }));

    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
      stopAttempts,
    });
    createTranscript();

    const result = await handleStop(createInput());

    expect(result).toEqual({ decision: 'continue' });
  });

  it('allows stop when stop_hook_active is true (recursion guard)', async () => {
    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
    });
    createTranscript();

    const result = await handleStop(createInput({ stop_hook_active: true }));

    expect(result).toEqual({ decision: 'continue' });
  });

  it('calls judge when directives exist and limits not exceeded', async () => {
    vi.mocked(judgeModule.runJudge).mockResolvedValue({
      pass: true,
      reason: 'All complete',
      missingItems: [],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    });

    createValidLedger({
      directives: [{ rawText: 'Build feature', type: 'initial', status: 'active' }],
    });
    createTranscript([{ role: 'assistant', content: 'I completed the feature.' }]);

    await handleStop(createInput());

    expect(judgeModule.runJudge).toHaveBeenCalledTimes(1);
  });

  it('returns block when judge fails with missing items', async () => {
    vi.mocked(judgeModule.runJudge).mockResolvedValue({
      pass: false,
      reason: 'Tests not implemented',
      missingItems: ['Unit tests', 'Integration tests'],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: ['Add unit tests', 'Run npm test'],
    });

    createValidLedger({
      directives: [{ rawText: 'Add tests', type: 'initial', status: 'active' }],
    });
    createTranscript();

    const result = await handleStop(createInput());

    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('Tests not implemented');
    expect(result?.reason).toContain('Unit tests');
  });

  it('records stop attempt in ledger after judge evaluation', async () => {
    vi.mocked(judgeModule.runJudge).mockResolvedValue({
      pass: false,
      reason: 'Incomplete',
      missingItems: ['Item 1'],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    });

    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
    });
    createTranscript();

    await handleStop(createInput());

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.stopAttempts.length).toBeGreaterThanOrEqual(1);
    const lastAttempt = ledger.stopAttempts[ledger.stopAttempts.length - 1];
    expect(lastAttempt.verdict).toBe('incomplete');
    expect(lastAttempt.reason).toBe('Incomplete');
  });

  it('marks directives as completed when judge passes', async () => {
    vi.mocked(judgeModule.runJudge).mockResolvedValue({
      pass: true,
      reason: 'All done',
      missingItems: [],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    });

    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
    });
    createTranscript();

    await handleStop(createInput());

    const ledgerPath = join(tempDir, '.claude', 'realitycheck', 'task_ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

    expect(ledger.directives[0].status).toBe('completed');
    expect(ledger.directives[0].completedAt).toBeDefined();
  });

  it('includes questions for user in block reason', async () => {
    vi.mocked(judgeModule.runJudge).mockResolvedValue({
      pass: false,
      reason: 'Need clarification',
      missingItems: [],
      questionsForUser: ['Which database?'],
      forwardProgress: false,
      suggestedNextSteps: [],
    });

    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
    });
    createTranscript();

    const result = await handleStop(createInput());

    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('Which database?');
  });

  it('handles invalid input gracefully (fails open)', async () => {
    const result = await handleStop({ invalid: 'data' });

    expect(result).toEqual({ decision: 'continue' });
  });

  it('blocks when stagnant after no progress threshold (default: 5)', async () => {
    // Create ledger with 5 consecutive failures (noProgressThreshold default is 5)
    // and same fingerprints, indicating no progress
    createValidLedger({
      directives: [{ rawText: 'Task', type: 'initial', status: 'active' }],
      stopAttempts: [
        { verdict: 'incomplete', reason: '1' },
        { verdict: 'incomplete', reason: '2' },
        { verdict: 'incomplete', reason: '3' },
        { verdict: 'incomplete', reason: '4' },
        { verdict: 'incomplete', reason: '5' },
      ],
      fingerprints: [
        { hash: 'same' },
        { hash: 'same' },
        { hash: 'same' },
        { hash: 'same' },
        { hash: 'same' },
      ],
    });
    createTranscript();

    const result = await handleStop(createInput());

    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('progress');
  });
});

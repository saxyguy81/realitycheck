import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LedgerManager } from './index.js';
import { getDefaultConfig, RealityCheckConfigSchema } from '../config/index.js';

describe('LedgerManager', () => {
  let testDir: string;
  let manager: LedgerManager;

  beforeEach(async () => {
    testDir = join(tmpdir(), `realitycheck-ledger-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    manager = new LedgerManager(getDefaultConfig(), testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create storage directory and ledger file', async () => {
      await manager.initialize();

      const ledgerPath = join(testDir, '.claude', 'realitycheck', 'task_ledger.json');
      expect(existsSync(ledgerPath)).toBe(true);

      const content = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.directives).toEqual([]);
      expect(content.stopAttempts).toEqual([]);
    });

    it('should load existing ledger on initialize', async () => {
      // First initialization
      await manager.initialize();
      await manager.addDirective('Test task', 'initial');

      // Create new manager and initialize (should load existing)
      const manager2 = new LedgerManager(getDefaultConfig(), testDir);
      await manager2.initialize();

      const directives = manager2.getAllDirectives();
      expect(directives).toHaveLength(1);
      expect(directives[0].rawText).toBe('Test task');
    });
  });

  describe('addDirective', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should add a directive with required fields', async () => {
      const directive = await manager.addDirective('Build feature X', 'initial');

      expect(directive.id).toBeDefined();
      expect(directive.rawText).toBe('Build feature X');
      expect(directive.type).toBe('initial');
      expect(directive.status).toBe('active');
      expect(directive.createdAt).toBeDefined();
    });

    it('should add directive with optional normalized intent', async () => {
      const directive = await manager.addDirective(
        'Fix that bug you mentioned',
        'followup',
        'Fix authentication bug in login flow'
      );

      expect(directive.normalizedIntent).toBe('Fix authentication bug in login flow');
    });

    it('should persist directive to file', async () => {
      await manager.addDirective('Persist me', 'initial');

      const ledgerPath = join(testDir, '.claude', 'realitycheck', 'task_ledger.json');
      const content = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
      expect(content.directives).toHaveLength(1);
      expect(content.directives[0].rawText).toBe('Persist me');
    });
  });

  describe('updateDirectiveStatus', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should update directive status', async () => {
      const directive = await manager.addDirective('Test', 'initial');
      await manager.updateDirectiveStatus(directive.id, 'completed');

      const directives = manager.getAllDirectives();
      expect(directives[0].status).toBe('completed');
      expect(directives[0].completedAt).toBeDefined();
    });

    it('should throw for non-existent directive', async () => {
      await expect(
        manager.updateDirectiveStatus('non-existent-id', 'completed')
      ).rejects.toThrow('Directive not found');
    });
  });

  describe('recordStopAttempt', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should record stop attempt with generated id and timestamp', async () => {
      const attempt = await manager.recordStopAttempt({
        verdict: 'incomplete',
        reason: 'Tests failing',
        fingerprintBefore: 'hash1',
        fingerprintAfter: 'hash2',
      });

      expect(attempt.id).toBeDefined();
      expect(attempt.timestamp).toBeDefined();
      expect(attempt.verdict).toBe('incomplete');
      expect(attempt.reason).toBe('Tests failing');
    });

    it('should accumulate multiple stop attempts', async () => {
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: 'First' });
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: 'Second' });
      await manager.recordStopAttempt({ verdict: 'complete', reason: 'Done' });

      const attempts = manager.getStopAttempts();
      expect(attempts).toHaveLength(3);
    });
  });

  describe('recordFingerprint', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should record fingerprint', async () => {
      await manager.recordFingerprint('abc123', 'npm test');

      const fingerprints = manager.getFingerprints();
      expect(fingerprints).toHaveLength(1);
      expect(fingerprints[0].hash).toBe('abc123');
      expect(fingerprints[0].afterCommand).toBe('npm test');
    });
  });

  describe('setBaseline', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should set git baseline', async () => {
      const baseline = {
        branch: 'main',
        commitHash: 'abc123def',
        isDirty: false,
        capturedAt: new Date().toISOString(),
      };

      await manager.setBaseline(baseline);

      const retrieved = manager.getBaseline();
      expect(retrieved).toEqual(baseline);
    });
  });

  describe('getActiveDirectives', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should return only active directives', async () => {
      const d1 = await manager.addDirective('Active 1', 'initial');
      await manager.addDirective('Active 2', 'followup');
      await manager.addDirective('To complete', 'followup');

      await manager.updateDirectiveStatus(d1.id, 'superseded');

      const active = manager.getActiveDirectives();
      expect(active).toHaveLength(2);
      expect(active.map((d) => d.rawText)).not.toContain('Active 1');
    });
  });

  describe('checkLimits', () => {
    it('should detect consecutive failures limit exceeded', async () => {
      const config = RealityCheckConfigSchema.parse({
        limits: { maxConsecutiveFailures: 3 },
      });
      manager = new LedgerManager(config, testDir);
      await manager.initialize();

      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '1' });
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '2' });
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '3' });

      const result = manager.checkLimits();
      expect(result.exceeded).toBe(true);
      expect(result.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive count after success', async () => {
      const config = RealityCheckConfigSchema.parse({
        limits: { maxConsecutiveFailures: 5 },
      });
      manager = new LedgerManager(config, testDir);
      await manager.initialize();

      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '1' });
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '2' });
      await manager.recordStopAttempt({ verdict: 'complete', reason: 'success' });
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '3' });

      const result = manager.checkLimits();
      expect(result.exceeded).toBe(false);
      expect(result.consecutiveFailures).toBe(1);
    });

    it('should detect total attempts limit exceeded', async () => {
      const config = RealityCheckConfigSchema.parse({
        limits: { maxTotalAttempts: 3, maxConsecutiveFailures: 100 },
      });
      manager = new LedgerManager(config, testDir);
      await manager.initialize();

      await manager.recordStopAttempt({ verdict: 'complete', reason: '1' });
      await manager.recordStopAttempt({ verdict: 'complete', reason: '2' });
      await manager.recordStopAttempt({ verdict: 'complete', reason: '3' });

      const result = manager.checkLimits();
      expect(result.exceeded).toBe(true);
      expect(result.totalAttempts).toBe(3);
    });
  });

  describe('analyzeProgress', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should report improving when no failures', async () => {
      const result = manager.analyzeProgress();
      expect(result.trend).toBe('improving');
    });

    it('should report stagnant when many failures with same fingerprint', async () => {
      const config = RealityCheckConfigSchema.parse({
        limits: { noProgressThreshold: 3 },
      });
      manager = new LedgerManager(config, testDir);
      await manager.initialize();

      // Same fingerprint for all
      await manager.recordFingerprint('same-hash');
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '1' });
      await manager.recordFingerprint('same-hash');
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '2' });
      await manager.recordFingerprint('same-hash');
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: '3' });

      const result = manager.analyzeProgress();
      expect(result.trend).toBe('stagnant');
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('reset', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should clear all data', async () => {
      await manager.addDirective('Test', 'initial');
      await manager.recordStopAttempt({ verdict: 'incomplete', reason: 'test' });
      await manager.recordFingerprint('hash1');

      await manager.reset();

      expect(manager.getAllDirectives()).toHaveLength(0);
      expect(manager.getStopAttempts()).toHaveLength(0);
      expect(manager.getFingerprints()).toHaveLength(0);
    });

    it('should generate new session ID', async () => {
      const oldSessionId = manager.getSessionId();
      await manager.reset();
      const newSessionId = manager.getSessionId();

      expect(newSessionId).not.toBe(oldSessionId);
    });
  });

  describe('error handling', () => {
    it('should throw when not initialized', () => {
      const uninitManager = new LedgerManager(getDefaultConfig(), testDir);
      expect(() => uninitManager.getAllDirectives()).toThrow('not initialized');
    });
  });
});

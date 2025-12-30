import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RealityCheckConfigSchema,
  loadConfig,
  getStoragePath,
  getLedgerPath,
  getDefaultConfig,
} from './index.js';

describe('RealityCheckConfigSchema', () => {
  it('should parse empty config with defaults', () => {
    const config = RealityCheckConfigSchema.parse({});
    expect(config.judge.model).toBe('opus');
    expect(config.judge.timeout).toBe(30000);
    expect(config.limits.maxConsecutiveFailures).toBe(20);
    expect(config.limits.maxTotalAttempts).toBe(50);
    expect(config.storage.directory).toBe('.claude/realitycheck');
  });

  it('should parse partial config with overrides', () => {
    const config = RealityCheckConfigSchema.parse({
      judge: { model: 'sonnet', timeout: 60000 },
      limits: { maxConsecutiveFailures: 10 },
    });
    expect(config.judge.model).toBe('sonnet');
    expect(config.judge.timeout).toBe(60000);
    expect(config.limits.maxConsecutiveFailures).toBe(10);
    expect(config.limits.maxTotalAttempts).toBe(50); // default
  });

  it('should reject invalid model', () => {
    expect(() =>
      RealityCheckConfigSchema.parse({
        judge: { model: 'invalid-model' },
      })
    ).toThrow();
  });

  it('should reject timeout out of range', () => {
    expect(() =>
      RealityCheckConfigSchema.parse({
        judge: { timeout: 1000 }, // below min
      })
    ).toThrow();
  });
});

describe('loadConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `realitycheck-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return defaults when no config file exists', () => {
    const config = loadConfig(testDir);
    expect(config.judge.model).toBe('opus');
  });

  it('should load config from .claude/realitycheck.config.json', () => {
    const configDir = join(testDir, '.claude');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'realitycheck.config.json'),
      JSON.stringify({ judge: { model: 'haiku' } })
    );

    const config = loadConfig(testDir);
    expect(config.judge.model).toBe('haiku');
  });

  it('should load config from realitycheck.config.json in project root', () => {
    writeFileSync(
      join(testDir, 'realitycheck.config.json'),
      JSON.stringify({ judge: { timeout: 45000 } })
    );

    const config = loadConfig(testDir);
    expect(config.judge.timeout).toBe(45000);
  });

  it('should prefer .claude/ location over project root', () => {
    const configDir = join(testDir, '.claude');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'realitycheck.config.json'),
      JSON.stringify({ judge: { model: 'haiku' } })
    );
    writeFileSync(
      join(testDir, 'realitycheck.config.json'),
      JSON.stringify({ judge: { model: 'sonnet' } })
    );

    const config = loadConfig(testDir);
    expect(config.judge.model).toBe('haiku');
  });

  it('should fall back to defaults on invalid JSON', () => {
    writeFileSync(
      join(testDir, 'realitycheck.config.json'),
      'invalid json {'
    );

    const config = loadConfig(testDir);
    expect(config.judge.model).toBe('opus');
  });
});

describe('getStoragePath', () => {
  it('should return correct storage path', () => {
    const config = getDefaultConfig();
    const storagePath = getStoragePath(config, '/project');
    expect(storagePath).toBe('/project/.claude/realitycheck');
  });

  it('should use custom storage directory', () => {
    const config = RealityCheckConfigSchema.parse({
      storage: { directory: 'custom/storage' },
    });
    const storagePath = getStoragePath(config, '/project');
    expect(storagePath).toBe('/project/custom/storage');
  });
});

describe('getLedgerPath', () => {
  it('should return correct ledger path', () => {
    const config = getDefaultConfig();
    const ledgerPath = getLedgerPath(config, '/project');
    expect(ledgerPath).toBe('/project/.claude/realitycheck/task_ledger.json');
  });
});

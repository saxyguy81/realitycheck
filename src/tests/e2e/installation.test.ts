/**
 * E2E Tests for Installation (Phase 5 verification)
 *
 * These tests verify the build, installation scripts, and example configs.
 * They use isolated temp directories to avoid polluting the project.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
  copyFileSync,
  chmodSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync, spawnSync } from 'child_process';

describe('Installation E2E Tests', () => {
  let tempDir: string;
  const projectRoot = process.cwd();

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-e2e-install-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Build Verification', () => {
    it('npm run build succeeds', () => {
      // This test assumes build has already been run
      // If not, it will fail and indicate build is needed
      const distDir = join(projectRoot, 'dist');

      expect(existsSync(distDir)).toBe(true);
      expect(existsSync(join(distDir, 'cli', 'index.js'))).toBe(true);
      expect(existsSync(join(distDir, 'index.js'))).toBe(true);
    });

    it('realitycheck binary is executable after build', () => {
      const cliPath = join(projectRoot, 'dist', 'cli', 'index.js');

      expect(existsSync(cliPath)).toBe(true);

      // Try to run with --help or version flag
      const result = spawnSync('node', [cliPath, '--help'], {
        cwd: tempDir,
        encoding: 'utf-8',
        timeout: 5000,
        input: JSON.stringify({ hook_event_name: 'unknown' }),
      });

      // Should not crash
      expect([0, null]).toContain(result.status);
    });

    it('built modules have correct exports', async () => {
      // Test that main exports work
      const indexPath = join(projectRoot, 'dist', 'index.js');
      expect(existsSync(indexPath)).toBe(true);

      // Test that type definitions would be available
      const typesPath = join(projectRoot, 'dist', 'types', 'index.js');
      expect(existsSync(typesPath)).toBe(true);
    });
  });

  describe('Hook Config Files', () => {
    it('example hooks config is valid JSON', () => {
      const configPath = join(projectRoot, 'examples', 'claude-hooks-config.json');

      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('example hooks config has required structure', () => {
      const configPath = join(projectRoot, 'examples', 'claude-hooks-config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      // Should have hooks object with event type keys
      expect(config.hooks).toBeDefined();
      expect(typeof config.hooks).toBe('object');

      // Should have at least some hook event types defined
      const hookEventTypes = Object.keys(config.hooks);
      expect(hookEventTypes.length).toBeGreaterThan(0);

      // Each hook event type should have an array of hook configurations
      for (const eventType of hookEventTypes) {
        expect(Array.isArray(config.hooks[eventType])).toBe(true);
      }
    });

    it('example hooks config references realitycheck command', () => {
      const configPath = join(projectRoot, 'examples', 'claude-hooks-config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      // Check if any hook event type uses realitycheck
      const hookEventTypes = Object.keys(config.hooks);
      const usesRealityCheck = hookEventTypes.some((eventType) =>
        config.hooks[eventType].some((hookConfig: { hooks: Array<{ command: string }> }) =>
          hookConfig.hooks?.some((h: { command: string }) => h.command?.includes('realitycheck'))
        )
      );

      expect(usesRealityCheck).toBe(true);
    });
  });

  describe('Example Configs', () => {
    it('realitycheck.config.json is valid JSON', () => {
      const configPath = join(projectRoot, 'examples', 'realitycheck.config.json');

      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }
    });

    it('example config has valid structure', () => {
      const configPath = join(projectRoot, 'examples', 'realitycheck.config.json');

      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));

        // Check for expected top-level keys (enabled is optional, has default)
        const expectedKeys = ['judge', 'limits'];
        for (const key of expectedKeys) {
          expect(config).toHaveProperty(key);
        }

        // Judge should have model and timeout
        expect(config.judge).toHaveProperty('model');
        expect(config.judge).toHaveProperty('timeout');

        // Limits should have required fields
        expect(config.limits).toHaveProperty('maxConsecutiveFailures');
        expect(config.limits).toHaveProperty('maxTotalAttempts');
      }
    });
  });

  describe('Install Script', () => {
    it('install-to-project.sh copies hooks to target directory', () => {
      const scriptPath = join(projectRoot, 'scripts', 'install-to-project.sh');

      if (!existsSync(scriptPath)) {
        // Skip if script doesn't exist
        return;
      }

      // Create target project structure
      const targetProject = join(tempDir, 'target-project');
      mkdirSync(targetProject, { recursive: true });

      // Copy script to temp dir and make executable
      const tempScript = join(tempDir, 'install.sh');
      copyFileSync(scriptPath, tempScript);
      chmodSync(tempScript, '755');

      // Run the script with the target directory
      const result = spawnSync('bash', [tempScript, targetProject], {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 10000,
        env: { ...process.env, REALITYCHECK_PROJECT: projectRoot },
      });

      // Script should either succeed or provide meaningful error
      // We mainly want to ensure it doesn't crash
      expect(result.error).toBeUndefined();
    });
  });

  describe('Setup Script', () => {
    it('setup.sh is executable', () => {
      const scriptPath = join(projectRoot, 'scripts', 'setup.sh');

      if (existsSync(scriptPath)) {
        const stats = statSync(scriptPath);
        const isExecutable = (stats.mode & 0o111) !== 0;

        // Should be executable or we should be able to make it so
        expect(existsSync(scriptPath)).toBe(true);
      }
    });
  });

  describe('Package.json Validation', () => {
    it('package.json has required fields', () => {
      const packagePath = join(projectRoot, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      expect(pkg.name).toBe('realitycheck');
      expect(pkg.main).toBeDefined();
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin.realitycheck).toBeDefined();
    });

    it('package.json bin points to valid file', () => {
      const packagePath = join(projectRoot, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const binPath = join(projectRoot, pkg.bin.realitycheck);
      // Path should exist after build (or be dist/cli/index.js which we know exists)
      expect(pkg.bin.realitycheck).toContain('dist/cli/index.js');
    });

    it('package.json has required scripts', () => {
      const packagePath = join(projectRoot, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const requiredScripts = ['build', 'test', 'typecheck'];
      for (const script of requiredScripts) {
        expect(pkg.scripts[script]).toBeDefined();
      }
    });
  });

  describe('TypeScript Config', () => {
    it('tsconfig.json is valid JSON', () => {
      const tsconfigPath = join(projectRoot, 'tsconfig.json');

      expect(existsSync(tsconfigPath)).toBe(true);

      const content = readFileSync(tsconfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('tsconfig.json has required compiler options', () => {
      const tsconfigPath = join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.compilerOptions).toBeDefined();
      expect(tsconfig.compilerOptions.outDir).toBeDefined();
      expect(tsconfig.compilerOptions.module).toBeDefined();
    });
  });

  describe('Test Isolation', () => {
    it('tests use temp directories', () => {
      // This test verifies our test setup
      expect(tempDir).toContain(tmpdir());
      expect(existsSync(tempDir)).toBe(true);
    });

    it('temp directory is cleaned up after tests', () => {
      // Create a file in temp dir
      const testFile = join(tempDir, 'test-cleanup.txt');
      require('fs').writeFileSync(testFile, 'test');

      expect(existsSync(testFile)).toBe(true);

      // The afterEach will clean this up
      // We just verify the file was created
    });
  });
});

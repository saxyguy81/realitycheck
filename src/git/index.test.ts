import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { GitManager } from './index.js';

describe('GitManager', () => {
  let tempDir: string;
  let gitManager: GitManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realitycheck-git-test-'));
    gitManager = new GitManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    it('returns false for non-git directory', () => {
      expect(gitManager.isGitRepo()).toBe(false);
    });

    it('returns true for git directory', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      expect(gitManager.isGitRepo()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('returns isRepo false for non-git directory', () => {
      const status = gitManager.getStatus();
      expect(status.isRepo).toBe(false);
      expect(status.dirtyFiles).toEqual([]);
      expect(status.untrackedFiles).toEqual([]);
    });

    it('correctly identifies dirty and untracked files', () => {
      // Initialize git repo
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });

      // Create and commit an initial file
      fs.writeFileSync(path.join(tempDir, 'committed.txt'), 'initial content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      // Modify the committed file (makes it dirty)
      fs.writeFileSync(path.join(tempDir, 'committed.txt'), 'modified content');

      // Create an untracked file
      fs.writeFileSync(path.join(tempDir, 'untracked.txt'), 'untracked content');

      const status = gitManager.getStatus();

      expect(status.isRepo).toBe(true);
      expect(status.headCommit).toBeDefined();
      expect(status.branch).toBe('main');
      expect(status.dirtyFiles).toContain('committed.txt');
      expect(status.untrackedFiles).toContain('untracked.txt');
    });

    it('returns headCommit and branch for git repo', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const status = gitManager.getStatus();

      expect(status.isRepo).toBe(true);
      expect(status.headCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(status.branch).toBe('main');
    });
  });

  describe('computeFingerprint', () => {
    it('returns consistent hash for unchanged workspace', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const fingerprint1 = gitManager.computeFingerprint();
      const fingerprint2 = gitManager.computeFingerprint();

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(16);
    });

    it('returns different hash after file modification', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const fingerprint1 = gitManager.computeFingerprint();

      // Modify the file
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'modified content');

      const fingerprint2 = gitManager.computeFingerprint();

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('returns fingerprint for non-git directory using file mtimes', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

      const fingerprint = gitManager.computeFingerprint();

      expect(fingerprint).toHaveLength(16);
      expect(fingerprint).toMatch(/^[a-f0-9]+$/);
    });

    it('returns different fingerprint after file mtime change in non-git', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const fingerprint1 = gitManager.computeFingerprint();

      // Wait a bit and modify file
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"modified": true}');

      const fingerprint2 = gitManager.computeFingerprint();

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('getCurrentDiff', () => {
    it('returns null for non-git repos', () => {
      const diff = gitManager.getCurrentDiff();
      expect(diff).toBeNull();
    });

    it('returns diff with files for modified repo', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      // Modify file
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial\nmodified');

      const diff = gitManager.getCurrentDiff();

      expect(diff).not.toBeNull();
      expect(diff!.files).toHaveLength(1);
      expect(diff!.files[0].path).toBe('test.txt');
      expect(diff!.files[0].additions).toBeGreaterThan(0);
      expect(diff!.summary).toContain('test.txt');
      expect(diff!.patch).toBeDefined();
    });

    it('returns empty files list when no changes', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const diff = gitManager.getCurrentDiff();

      expect(diff).not.toBeNull();
      expect(diff!.files).toHaveLength(0);
    });
  });

  describe('getDiffSince', () => {
    it('returns null for non-git repos', () => {
      const diff = gitManager.getDiffSince('abc123');
      expect(diff).toBeNull();
    });

    it('returns diff since baseline commit', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const baselineCommit = execSync('git rev-parse HEAD', {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      // Make another commit
      fs.writeFileSync(path.join(tempDir, 'new.txt'), 'new file');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "second"', { cwd: tempDir, stdio: 'pipe' });

      const diff = gitManager.getDiffSince(baselineCommit);

      expect(diff).not.toBeNull();
      expect(diff!.files).toHaveLength(1);
      expect(diff!.files[0].path).toBe('new.txt');
    });

    it('returns null for invalid commit', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const diff = gitManager.getDiffSince('invalidcommit123');
      expect(diff).toBeNull();
    });
  });

  describe('createBaseline', () => {
    it('copies dirty files to snapshot directory', async () => {
      const snapshotDir = path.join(tempDir, 'snapshot');

      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      // Modify file to make it dirty
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'modified');
      // Add untracked file
      fs.writeFileSync(path.join(tempDir, 'untracked.txt'), 'new');

      const baseline = await gitManager.createBaseline(snapshotDir);

      expect(baseline.headCommit).toBeDefined();
      expect(baseline.timestamp).toBeDefined();
      expect(baseline.dirtyFiles).toContain('test.txt');
      expect(baseline.dirtyFiles).toContain('untracked.txt');

      // Verify files were copied
      expect(fs.existsSync(path.join(snapshotDir, 'test.txt'))).toBe(true);
      expect(fs.existsSync(path.join(snapshotDir, 'untracked.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(snapshotDir, 'test.txt'), 'utf-8')).toBe('modified');
    });

    it('creates snapshot directory if it does not exist', async () => {
      const snapshotDir = path.join(tempDir, 'nested', 'snapshot', 'dir');

      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'modified');

      await gitManager.createBaseline(snapshotDir);

      expect(fs.existsSync(snapshotDir)).toBe(true);
    });

    it('handles nested dirty files', async () => {
      const snapshotDir = path.join(tempDir, 'snapshot');

      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      // Modify nested file
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'modified');

      await gitManager.createBaseline(snapshotDir);

      expect(fs.existsSync(path.join(snapshotDir, 'src', 'index.ts'))).toBe(true);
    });

    it('works for non-git directories', async () => {
      const snapshotDir = path.join(tempDir, 'snapshot');
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');

      const baseline = await gitManager.createBaseline(snapshotDir);

      expect(baseline.headCommit).toBeUndefined();
      expect(baseline.timestamp).toBeDefined();
      expect(baseline.dirtyFiles).toEqual([]);
    });
  });
});

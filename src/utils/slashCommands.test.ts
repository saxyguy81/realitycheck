import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  expandSlashCommand,
  extractFileReferences,
  listAvailableCommands,
} from './slashCommands.js';

describe('slashCommands utilities', () => {
  let tempDir: string;
  let projectCommandsDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-slash-test-${Date.now()}`);
    projectCommandsDir = join(tempDir, '.claude', 'commands');
    mkdirSync(projectCommandsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('expandSlashCommand', () => {
    it('returns null for non-slash prompts', async () => {
      const result = await expandSlashCommand('Hello world', tempDir);
      expect(result).toBeNull();
    });

    it('returns null for built-in commands', async () => {
      const builtins = ['/help', '/clear', '/compact', '/config', '/cost'];

      for (const command of builtins) {
        const result = await expandSlashCommand(command, tempDir);
        expect(result).toBeNull();
      }
    });

    it('expands user command from .claude/commands/', async () => {
      const commandPath = join(projectCommandsDir, 'test-command.md');
      writeFileSync(commandPath, '# Test Command\n\nThis is the test command content.');

      const result = await expandSlashCommand('/test-command', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toContain('This is the test command content.');
      expect(result!.summary).toBe('Test Command');
      expect(result!.originalCommand).toBe('/test-command');
    });

    it('replaces $ARGUMENTS placeholder', async () => {
      const commandPath = join(projectCommandsDir, 'greet.md');
      writeFileSync(commandPath, 'Hello $ARGUMENTS!');

      const result = await expandSlashCommand('/greet world friend', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toBe('Hello world friend!');
    });

    it('replaces positional args $1, $2', async () => {
      const commandPath = join(projectCommandsDir, 'commit.md');
      writeFileSync(commandPath, 'Commit with type: $1 and message: $2');

      // Note: shell-style argument parsing splits on whitespace
      // So "fix bugfix" becomes ["fix", "bugfix"]
      const result = await expandSlashCommand('/commit fix bugfix', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toBe('Commit with type: fix and message: bugfix');
    });

    it('handles missing command file', async () => {
      const result = await expandSlashCommand('/nonexistent', tempDir);
      expect(result).toBeNull();
    });

    it('expands nested commands with colon separator', async () => {
      const nestedDir = join(projectCommandsDir, 'git');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, 'commit.md'), '# Git Commit\n\nCommit all changes');

      const result = await expandSlashCommand('/git:commit', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toContain('Commit all changes');
    });

    it('removes unused placeholders', async () => {
      const commandPath = join(projectCommandsDir, 'template.md');
      writeFileSync(commandPath, 'Required: $1, Optional: $2 $3');

      const result = await expandSlashCommand('/template value1', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toBe('Required: value1, Optional:  ');
    });

    it('expands @file references', async () => {
      const commandPath = join(projectCommandsDir, 'review.md');
      writeFileSync(commandPath, 'Review this file: @src/main.ts');

      const srcDir = join(tempDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'main.ts'), 'console.log("hello");');

      const result = await expandSlashCommand('/review', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toContain('<file path="src/main.ts">');
      expect(result!.expandedText).toContain('console.log("hello");');
      expect(result!.referencedFiles).toContain(join(srcDir, 'main.ts'));
    });

    it('preserves @file references for non-existent files', async () => {
      const commandPath = join(projectCommandsDir, 'review.md');
      writeFileSync(commandPath, 'Review: @nonexistent.ts');

      const result = await expandSlashCommand('/review', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toContain('@nonexistent.ts');
      expect(result!.referencedFiles).toEqual([]);
    });

    it('handles plain file commands (no .md extension)', async () => {
      const commandPath = join(projectCommandsDir, 'simple');
      writeFileSync(commandPath, 'This is a simple command');

      const result = await expandSlashCommand('/simple', tempDir);

      expect(result).not.toBeNull();
      expect(result!.expandedText).toBe('This is a simple command');
    });
  });

  describe('extractFileReferences', () => {
    it('extracts file references from prompt', () => {
      const srcDir = join(tempDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'file1.ts'), 'content1');
      writeFileSync(join(srcDir, 'file2.ts'), 'content2');

      const files = extractFileReferences(
        'Please review @src/file1.ts and @src/file2.ts',
        tempDir
      );

      expect(files).toHaveLength(2);
      expect(files).toContain(join(srcDir, 'file1.ts'));
      expect(files).toContain(join(srcDir, 'file2.ts'));
    });

    it('ignores non-existent file references', () => {
      const files = extractFileReferences(
        'Please review @nonexistent.ts',
        tempDir
      );

      expect(files).toEqual([]);
    });

    it('handles absolute paths', () => {
      const testFile = join(tempDir, 'absolute-test.ts');
      writeFileSync(testFile, 'content');

      const files = extractFileReferences(`Review @${testFile}`, tempDir);

      expect(files).toContain(testFile);
    });
  });

  describe('listAvailableCommands', () => {
    it('lists project commands', () => {
      writeFileSync(join(projectCommandsDir, 'cmd1.md'), 'Command 1');
      writeFileSync(join(projectCommandsDir, 'cmd2.md'), 'Command 2');

      const commands = listAvailableCommands(tempDir);

      expect(commands.project).toContain('cmd1');
      expect(commands.project).toContain('cmd2');
    });

    it('lists nested commands with colon separator', () => {
      const nestedDir = join(projectCommandsDir, 'git');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, 'commit.md'), 'Commit');
      writeFileSync(join(nestedDir, 'push.md'), 'Push');

      const commands = listAvailableCommands(tempDir);

      expect(commands.project).toContain('git:commit');
      expect(commands.project).toContain('git:push');
    });

    it('returns empty arrays for non-existent directories', () => {
      const emptyDir = join(tmpdir(), `empty-project-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });

      try {
        const commands = listAvailableCommands(emptyDir);

        expect(commands.project).toEqual([]);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});

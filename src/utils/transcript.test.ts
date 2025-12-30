import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readTranscript, formatTranscript } from './transcript.js';

describe('transcript utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `realitycheck-transcript-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readTranscript', () => {
    it('parses valid JSONL transcript', async () => {
      const transcriptPath = join(tempDir, 'transcript.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"timestamp":"2025-01-01T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Hi there!');
    });

    it('handles empty file', async () => {
      const transcriptPath = join(tempDir, 'empty.jsonl');
      writeFileSync(transcriptPath, '');

      const messages = await readTranscript(transcriptPath);

      expect(messages).toEqual([]);
    });

    it('handles non-existent file', async () => {
      const transcriptPath = join(tempDir, 'nonexistent.jsonl');

      const messages = await readTranscript(transcriptPath);

      expect(messages).toEqual([]);
    });

    it('handles malformed lines (skips them)', async () => {
      const transcriptPath = join(tempDir, 'malformed.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Valid"}]}}
not valid json
{"timestamp":"2025-01-01T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Also valid"}]}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Valid');
      expect(messages[1].content).toBe('Also valid');
    });

    it('extracts text content from content blocks', async () => {
      const transcriptPath = join(tempDir, 'blocks.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"First part"},{"type":"text","text":"Second part"}]}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('First part\nSecond part');
    });

    it('returns last N messages when specified', async () => {
      const transcriptPath = join(tempDir, 'multiple.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Message 1"}]}}
{"timestamp":"2025-01-01T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Message 2"}]}}
{"timestamp":"2025-01-01T00:00:10Z","message":{"role":"user","content":[{"type":"text","text":"Message 3"}]}}
{"timestamp":"2025-01-01T00:00:15Z","message":{"role":"assistant","content":[{"type":"text","text":"Message 4"}]}}`
      );

      const messages = await readTranscript(transcriptPath, { lastN: 2 });

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 3');
      expect(messages[1].content).toBe('Message 4');
    });

    it('extracts tool use information', async () => {
      const transcriptPath = join(tempDir, 'tooluse.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me run that"},{"type":"tool_use","name":"Bash","input":{"command":"npm test"}}]}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(1);
      expect(messages[0].toolUse).toBeDefined();
      expect(messages[0].toolUse?.name).toBe('Bash');
      expect(messages[0].toolUse?.input).toEqual({ command: 'npm test' });
    });

    it('handles string content (not array)', async () => {
      const transcriptPath = join(tempDir, 'string-content.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":"Simple string content"}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Simple string content');
    });

    it('skips entries without message field', async () => {
      const transcriptPath = join(tempDir, 'no-message.jsonl');
      writeFileSync(
        transcriptPath,
        `{"timestamp":"2025-01-01T00:00:00Z","type":"system_event"}
{"timestamp":"2025-01-01T00:00:05Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}`
      );

      const messages = await readTranscript(transcriptPath);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello');
    });
  });

  describe('formatTranscript', () => {
    it('formats messages as human-readable text', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      const formatted = formatTranscript(messages);

      expect(formatted).toContain('[USER]: Hello');
      expect(formatted).toContain('[ASSISTANT]: Hi there!');
    });

    it('includes tool use information', () => {
      const messages = [
        {
          role: 'assistant' as const,
          content: 'Running tests',
          toolUse: { name: 'Bash', input: { command: 'npm test' } },
        },
      ];

      const formatted = formatTranscript(messages);

      expect(formatted).toContain('[ASSISTANT]: Running tests');
      expect(formatted).toContain('[Tool: Bash]');
    });
  });
});

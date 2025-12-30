import { describe, it, expect } from 'vitest';
import {
  BaseHookInputSchema,
  UserPromptSubmitInputSchema,
  StopHookInputSchema,
  PostToolUseInputSchema,
  SessionStartInputSchema,
  HookDecisionSchema,
  DirectiveSchema,
  StopAttemptSchema,
  TaskLedgerSchema,
} from './index.js';

describe('Hook Input Schemas', () => {
  describe('BaseHookInputSchema', () => {
    it('should validate basic hook input', () => {
      const input = {
        session_id: 'test-session-123',
        transcript_path: '/path/to/transcript',
      };
      expect(() => BaseHookInputSchema.parse(input)).not.toThrow();
    });

    it('should reject missing fields', () => {
      const input = { session_id: 'test' };
      expect(() => BaseHookInputSchema.parse(input)).toThrow();
    });
  });

  describe('UserPromptSubmitInputSchema', () => {
    it('should validate user prompt submit input', () => {
      const input = {
        hook_type: 'UserPromptSubmit',
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
        prompt: 'Help me implement a feature',
      };
      expect(() => UserPromptSubmitInputSchema.parse(input)).not.toThrow();
    });
  });

  describe('StopHookInputSchema', () => {
    it('should validate stop hook input with stop_hook_active', () => {
      const input = {
        hook_type: 'Stop',
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
        stop_hook_active: true,
      };
      const result = StopHookInputSchema.parse(input);
      expect(result.stop_hook_active).toBe(true);
    });

    it('should default stop_hook_active to false', () => {
      const input = {
        hook_type: 'Stop',
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
      };
      const result = StopHookInputSchema.parse(input);
      expect(result.stop_hook_active).toBe(false);
    });
  });

  describe('PostToolUseInputSchema', () => {
    it('should validate post tool use input', () => {
      const input = {
        hook_type: 'PostToolUse',
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
        tool_name: 'Write',
        tool_input: { file_path: '/test.txt', content: 'hello' },
        tool_output: { success: true },
      };
      expect(() => PostToolUseInputSchema.parse(input)).not.toThrow();
    });
  });

  describe('SessionStartInputSchema', () => {
    it('should validate session start input', () => {
      const input = {
        hook_type: 'SessionStart',
        session_id: 'test-session',
        transcript_path: '/path/to/transcript',
      };
      expect(() => SessionStartInputSchema.parse(input)).not.toThrow();
    });
  });
});

describe('Hook Decision Schema', () => {
  it('should validate continue decision', () => {
    const decision = { decision: 'continue' };
    expect(() => HookDecisionSchema.parse(decision)).not.toThrow();
  });

  it('should validate block decision with reason', () => {
    const decision = {
      decision: 'block',
      reason: 'Task not complete',
    };
    expect(() => HookDecisionSchema.parse(decision)).not.toThrow();
  });

  it('should reject block decision without reason', () => {
    const decision = { decision: 'block' };
    expect(() => HookDecisionSchema.parse(decision)).toThrow();
  });
});

describe('Task Ledger Schemas', () => {
  describe('DirectiveSchema', () => {
    it('should validate a complete directive', () => {
      const directive = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        rawText: 'Implement user authentication',
        normalizedIntent: 'Add login/logout functionality',
        type: 'initial',
        status: 'active',
        createdAt: '2024-01-15T10:30:00.000Z',
      };
      expect(() => DirectiveSchema.parse(directive)).not.toThrow();
    });

    it('should validate directive without optional fields', () => {
      const directive = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        rawText: 'Fix the bug',
        type: 'followup',
        status: 'active',
        createdAt: '2024-01-15T10:30:00.000Z',
      };
      expect(() => DirectiveSchema.parse(directive)).not.toThrow();
    });
  });

  describe('StopAttemptSchema', () => {
    it('should validate a stop attempt', () => {
      const attempt = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: '2024-01-15T10:35:00.000Z',
        verdict: 'incomplete',
        reason: 'Tests are failing',
        fingerprintBefore: 'abc123',
        fingerprintAfter: 'def456',
      };
      expect(() => StopAttemptSchema.parse(attempt)).not.toThrow();
    });

    it('should validate all verdict types', () => {
      const verdicts = ['complete', 'incomplete', 'blocked', 'error'];
      for (const verdict of verdicts) {
        const attempt = {
          id: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: '2024-01-15T10:35:00.000Z',
          verdict,
          reason: 'Test reason',
        };
        expect(() => StopAttemptSchema.parse(attempt)).not.toThrow();
      }
    });
  });

  describe('TaskLedgerSchema', () => {
    it('should validate a complete ledger', () => {
      const ledger = {
        version: 1,
        sessionId: 'test-session-123',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        directives: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            rawText: 'Build feature X',
            type: 'initial',
            status: 'active',
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        criteria: [],
        stopAttempts: [],
        fingerprints: [],
      };
      expect(() => TaskLedgerSchema.parse(ledger)).not.toThrow();
    });

    it('should reject invalid version', () => {
      const ledger = {
        version: 2,
        sessionId: 'test-session',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        directives: [],
        criteria: [],
        stopAttempts: [],
        fingerprints: [],
      };
      expect(() => TaskLedgerSchema.parse(ledger)).toThrow();
    });
  });
});

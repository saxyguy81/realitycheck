/**
 * Mock hook input factories for testing
 * These create valid hook inputs with sensible defaults
 */

export interface MockUserPromptSubmitInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface MockStopHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export interface MockPostToolUseInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_output?: unknown;
}

export interface MockSessionStartInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart';
  source?: 'startup' | 'resume' | 'clear' | 'compact';
}

export function createMockUserPromptSubmitInput(
  overrides: Partial<MockUserPromptSubmitInput> = {}
): MockUserPromptSubmitInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Test prompt',
    ...overrides,
  };
}

export function createMockStopHookInput(
  overrides: Partial<MockStopHookInput> = {}
): MockStopHookInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...overrides,
  };
}

export function createMockPostToolUseInput(
  overrides: Partial<MockPostToolUseInput> = {}
): MockPostToolUseInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_output: { stdout: 'Tests passed', exitCode: 0 },
    ...overrides,
  };
}

export function createMockSessionStartInput(
  overrides: Partial<MockSessionStartInput> = {}
): MockSessionStartInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'SessionStart',
    source: 'startup',
    ...overrides,
  };
}

/**
 * Mock hook input factories for testing
 * These create valid hook inputs with sensible defaults
 */
export function createMockUserPromptSubmitInput(overrides = {}) {
    return {
        session_id: 'test-session-123',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/tmp/test-project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Test prompt',
        ...overrides,
    };
}
export function createMockStopHookInput(overrides = {}) {
    return {
        session_id: 'test-session-123',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/tmp/test-project',
        hook_event_name: 'Stop',
        stop_hook_active: false,
        ...overrides,
    };
}
export function createMockPostToolUseInput(overrides = {}) {
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
export function createMockSessionStartInput(overrides = {}) {
    return {
        session_id: 'test-session-123',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/tmp/test-project',
        hook_event_name: 'SessionStart',
        source: 'startup',
        ...overrides,
    };
}
//# sourceMappingURL=mockHookInput.js.map
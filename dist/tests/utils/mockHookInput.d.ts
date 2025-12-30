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
export declare function createMockUserPromptSubmitInput(overrides?: Partial<MockUserPromptSubmitInput>): MockUserPromptSubmitInput;
export declare function createMockStopHookInput(overrides?: Partial<MockStopHookInput>): MockStopHookInput;
export declare function createMockPostToolUseInput(overrides?: Partial<MockPostToolUseInput>): MockPostToolUseInput;
export declare function createMockSessionStartInput(overrides?: Partial<MockSessionStartInput>): MockSessionStartInput;
//# sourceMappingURL=mockHookInput.d.ts.map
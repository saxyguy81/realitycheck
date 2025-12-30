import { type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
export interface SessionResult {
    messages: AgentMessage[];
    finalText: string;
    toolsUsed: string[];
    wasBlocked: boolean;
    blockReason?: string;
    result?: SDKResultMessage;
}
interface AgentMessage {
    type: string;
    content?: string;
    toolName?: string;
    toolInput?: unknown;
    error?: string;
}
/**
 * Run a Claude session with the given prompt
 */
export declare function runSession(options: {
    prompt: string;
    cwd: string;
    maxTurns?: number;
    allowedTools?: string[];
}): Promise<SessionResult>;
/**
 * Run a session and expect it to complete without blocking
 */
export declare function runSessionExpectComplete(options: {
    prompt: string;
    cwd: string;
    maxTurns?: number;
}): Promise<SessionResult>;
/**
 * Run a session and expect it to be blocked
 */
export declare function runSessionExpectBlocked(options: {
    prompt: string;
    cwd: string;
    maxTurns?: number;
}): Promise<SessionResult>;
export {};
//# sourceMappingURL=agentSession.d.ts.map
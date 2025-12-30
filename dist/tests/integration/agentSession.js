import { query } from '@anthropic-ai/claude-agent-sdk';
import { INTEGRATION_CONFIG } from './config.js';
/**
 * Run a Claude session with the given prompt
 */
export async function runSession(options) {
    const { prompt, cwd, maxTurns = 10, allowedTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], } = options;
    const messages = [];
    let finalText = '';
    const toolsUsed = [];
    let wasBlocked = false;
    let blockReason;
    let result;
    try {
        const queryResult = query({
            prompt,
            options: {
                cwd,
                maxTurns,
                tools: allowedTools,
                permissionMode: 'acceptEdits', // Auto-accept for testing
                model: INTEGRATION_CONFIG.userAgentModel,
                settingSources: ['local'], // Load local settings for hooks
                env: {
                    ...process.env,
                    ANTHROPIC_BASE_URL: INTEGRATION_CONFIG.apiBaseUrl,
                },
            },
        });
        for await (const message of queryResult) {
            // Handle different message types
            if (message.type === 'assistant') {
                // Extract text content from assistant message
                const content = message.message.content;
                const textContent = content
                    .filter((block) => block.type === 'text' && typeof block.text === 'string')
                    .map(block => block.text)
                    .join('\n');
                if (textContent) {
                    messages.push({ type: 'text', content: textContent });
                    finalText = textContent;
                }
                // Check for tool use
                const toolUseBlocks = content
                    .filter((block) => block.type === 'tool_use' && typeof block.name === 'string');
                for (const toolUse of toolUseBlocks) {
                    messages.push({
                        type: 'tool_use',
                        toolName: toolUse.name,
                        toolInput: toolUse.input,
                    });
                    toolsUsed.push(toolUse.name);
                }
            }
            else if (message.type === 'result') {
                result = message;
                if (message.subtype !== 'success') {
                    // Check if this is due to hook blocking
                    if ('errors' in message && message.errors) {
                        const blockError = message.errors.find(e => e.toLowerCase().includes('block') ||
                            e.toLowerCase().includes('hook'));
                        if (blockError) {
                            wasBlocked = true;
                            blockReason = blockError;
                        }
                    }
                }
            }
            else if (message.type === 'system' && 'subtype' in message) {
                if (message.subtype === 'hook_response') {
                    // Check if hook blocked the action
                    const hookMsg = message;
                    try {
                        const hookOutput = JSON.parse(hookMsg.stdout);
                        if (hookOutput.decision === 'block') {
                            wasBlocked = true;
                            blockReason = hookOutput.reason;
                        }
                    }
                    catch {
                        // Not JSON output, check stderr
                        if (hookMsg.stderr && hookMsg.stderr.toLowerCase().includes('block')) {
                            wasBlocked = true;
                            blockReason = hookMsg.stderr;
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        // Check if this is a hook block
        if (error instanceof Error) {
            if (error.message.includes('blocked') || error.message.includes('hook')) {
                wasBlocked = true;
                blockReason = error.message;
            }
            else {
                throw error;
            }
        }
        else {
            throw error;
        }
    }
    return {
        messages,
        finalText,
        toolsUsed,
        wasBlocked,
        blockReason,
        result,
    };
}
/**
 * Run a session and expect it to complete without blocking
 */
export async function runSessionExpectComplete(options) {
    const result = await runSession(options);
    if (result.wasBlocked) {
        throw new Error(`Expected session to complete but was blocked: ${result.blockReason}`);
    }
    return result;
}
/**
 * Run a session and expect it to be blocked
 */
export async function runSessionExpectBlocked(options) {
    const result = await runSession(options);
    if (!result.wasBlocked) {
        throw new Error('Expected session to be blocked but it completed');
    }
    return result;
}
//# sourceMappingURL=agentSession.js.map
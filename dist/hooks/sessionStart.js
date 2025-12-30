import { z } from 'zod';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
/**
 * Extended input schema for SessionStart hook
 */
const SessionStartRawInputSchema = z.object({
    hook_event_name: z.literal('SessionStart'),
    session_id: z.string(),
    transcript_path: z.string(),
    cwd: z.string(),
    source: z.enum(['startup', 'resume', 'clear', 'compact']).optional(),
});
/**
 * Handle the SessionStart hook
 *
 * This hook is called when a Claude Code session starts or is restored.
 * It ensures the ledger is initialized and provides context about
 * preserved directives after a /clear command.
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns Output with optional additionalContext
 */
export async function handleSessionStart(rawInput) {
    // Parse and validate input
    const parseResult = SessionStartRawInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
        console.error('RealityCheck: Invalid SessionStart input');
        return undefined;
    }
    const input = parseResult.data;
    const { cwd, source } = input;
    // Load configuration
    const config = loadConfig(cwd);
    // Initialize ledger
    const ledger = new LedgerManager(config, cwd);
    await ledger.initialize();
    // For /clear, remind about preserved directives
    if (source === 'clear') {
        const activeDirectives = ledger.getActiveDirectives();
        if (activeDirectives.length > 0) {
            const directivesList = activeDirectives
                .map((d, i) => `${i + 1}. ${d.normalizedIntent || d.rawText}`)
                .join('\n');
            return {
                additionalContext: `[RealityCheck Context Restored]
The conversation was cleared, but RealityCheck has preserved the following active directives:

${directivesList}

Continue working toward completing these requirements. The quality gate remains active.`,
            };
        }
    }
    // For resume, provide status update if there are pending directives
    if (source === 'resume') {
        const activeDirectives = ledger.getActiveDirectives();
        const stopAttempts = ledger.getStopAttempts();
        if (activeDirectives.length > 0 && stopAttempts.length > 0) {
            const lastAttempt = stopAttempts[stopAttempts.length - 1];
            return {
                additionalContext: `[RealityCheck Session Resumed]
Previous session had ${activeDirectives.length} active directive(s) and ${stopAttempts.length} stop attempt(s).
Last verdict: ${lastAttempt.verdict} - ${lastAttempt.reason}

Continue working on the pending requirements.`,
            };
        }
    }
    return undefined;
}
//# sourceMappingURL=sessionStart.js.map
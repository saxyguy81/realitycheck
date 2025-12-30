/**
 * Output schema for SessionStart hook
 */
interface SessionStartOutput {
    additionalContext?: string;
}
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
export declare function handleSessionStart(rawInput: unknown): Promise<SessionStartOutput | undefined>;
export {};
//# sourceMappingURL=sessionStart.d.ts.map
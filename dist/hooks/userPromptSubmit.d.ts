/**
 * Output schema for UserPromptSubmit hook
 * Can inject additional context into the conversation
 */
interface UserPromptSubmitOutput {
    additionalContext?: string;
}
/**
 * Handle the UserPromptSubmit hook
 *
 * This hook is called when a user submits a new prompt. It:
 * 1. Expands slash commands if present
 * 2. Records the directive in the task ledger
 * 3. Creates a git baseline on the first prompt
 * 4. Returns context injection about RealityCheck being active
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns Output with optional additionalContext
 */
export declare function handleUserPromptSubmit(rawInput: unknown): Promise<UserPromptSubmitOutput | undefined>;
export {};
//# sourceMappingURL=userPromptSubmit.d.ts.map
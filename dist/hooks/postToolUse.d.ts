/**
 * Handle the PostToolUse hook
 *
 * This hook is called after a tool is executed. For Bash commands,
 * it records a workspace fingerprint to track changes.
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns undefined (no output needed)
 */
export declare function handlePostToolUse(rawInput: unknown): Promise<undefined>;
//# sourceMappingURL=postToolUse.d.ts.map
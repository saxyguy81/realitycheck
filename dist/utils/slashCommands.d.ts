/**
 * Result of expanding a slash command
 */
export interface ExpandedCommand {
    expandedText: string;
    summary: string;
    originalCommand: string;
    referencedFiles: string[];
}
/**
 * Extract file references from a prompt without expanding them
 * Useful for tracking which files are referenced in a command
 */
export declare function extractFileReferences(prompt: string, projectDir: string): string[];
/**
 * Expand a slash command into its full content
 *
 * Looks for command definitions in:
 * 1. Project-level: .claude/commands/
 * 2. User-level: ~/.claude/commands/
 *
 * @param prompt - The user's prompt (e.g., "/commit fix bug")
 * @param projectDir - The project root directory
 * @returns Expanded command or null if not expandable
 */
export declare function expandSlashCommand(prompt: string, projectDir: string): Promise<ExpandedCommand | null>;
/**
 * List available slash commands in a project
 *
 * @param projectDir - The project root directory
 * @returns Object with project and user command names
 */
export declare function listAvailableCommands(projectDir: string): {
    project: string[];
    user: string[];
};
//# sourceMappingURL=slashCommands.d.ts.map
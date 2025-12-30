import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
/**
 * Built-in Claude Code commands that cannot be expanded
 */
const BUILTIN_COMMANDS = new Set([
    'help',
    'clear',
    'compact',
    'config',
    'cost',
    'doctor',
    'init',
    'login',
    'logout',
    'memory',
    'model',
    'mcp',
    'permissions',
    'pr-comments',
    'resume',
    'status',
    'terminal-setup',
    'vim',
    'bug',
]);
/**
 * Parse a slash command from a prompt
 * Returns the command name and arguments, or null if not a slash command
 */
function parseSlashCommand(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed.startsWith('/'))
        return null;
    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0];
    const args = parts.slice(1);
    if (!name)
        return null;
    return { name, args };
}
/**
 * Find a command file in the given directory
 * Looks for both .md and no-extension files
 */
function findCommandFile(commandsDir, commandName) {
    if (!existsSync(commandsDir))
        return null;
    // Check for exact matches first
    const mdPath = join(commandsDir, `${commandName}.md`);
    if (existsSync(mdPath))
        return mdPath;
    const plainPath = join(commandsDir, commandName);
    if (existsSync(plainPath))
        return plainPath;
    // Check for nested commands (e.g., /foo:bar -> foo/bar.md)
    if (commandName.includes(':')) {
        const nestedPath = commandName.replace(/:/g, '/');
        const nestedMdPath = join(commandsDir, `${nestedPath}.md`);
        if (existsSync(nestedMdPath))
            return nestedMdPath;
    }
    return null;
}
/**
 * Replace argument placeholders in command content
 * Handles $ARGUMENTS (all args), $1, $2, etc.
 */
function replaceArguments(content, args) {
    let result = content;
    // Replace $ARGUMENTS with all arguments joined
    result = result.replace(/\$ARGUMENTS/g, args.join(' '));
    // Replace numbered placeholders $1, $2, etc.
    for (let i = 0; i < args.length; i++) {
        const placeholder = new RegExp(`\\$${i + 1}`, 'g');
        result = result.replace(placeholder, args[i]);
    }
    // Remove any remaining unused placeholders
    result = result.replace(/\$\d+/g, '');
    result = result.replace(/\$ARGUMENTS/g, '');
    return result;
}
/**
 * Expand @file references to inline file content
 * References like @path/to/file.ts become <file path="...">content</file>
 */
function expandFileReferences(content, projectDir) {
    const files = [];
    const fileRefPattern = /@([^\s,;:'"<>()[\]{}]+)/g;
    const expanded = content.replace(fileRefPattern, (match, filePath) => {
        // Resolve the file path relative to project directory
        const absolutePath = filePath.startsWith('/')
            ? filePath
            : resolve(projectDir, filePath);
        if (!existsSync(absolutePath)) {
            // Keep the original reference if file doesn't exist
            return match;
        }
        try {
            const fileContent = readFileSync(absolutePath, 'utf-8');
            files.push(absolutePath);
            return `<file path="${filePath}">\n${fileContent}\n</file>`;
        }
        catch {
            return match;
        }
    });
    return { expanded, files };
}
/**
 * Extract file references from a prompt without expanding them
 * Useful for tracking which files are referenced in a command
 */
export function extractFileReferences(prompt, projectDir) {
    const files = [];
    const fileRefPattern = /@([^\s,;:'"<>()[\]{}]+)/g;
    let match;
    while ((match = fileRefPattern.exec(prompt)) !== null) {
        const filePath = match[1];
        const absolutePath = filePath.startsWith('/')
            ? filePath
            : resolve(projectDir, filePath);
        if (existsSync(absolutePath)) {
            files.push(absolutePath);
        }
    }
    return files;
}
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
export async function expandSlashCommand(prompt, projectDir) {
    const parsed = parseSlashCommand(prompt);
    if (!parsed)
        return null;
    const { name, args } = parsed;
    // Built-in commands cannot be expanded
    if (BUILTIN_COMMANDS.has(name)) {
        return null;
    }
    // Search for command file
    const projectCommandsDir = join(projectDir, '.claude', 'commands');
    const userCommandsDir = join(homedir(), '.claude', 'commands');
    let commandFile = findCommandFile(projectCommandsDir, name);
    if (!commandFile) {
        commandFile = findCommandFile(userCommandsDir, name);
    }
    if (!commandFile) {
        // Command not found - might be a plugin command or invalid
        return null;
    }
    // Read and process the command file
    const rawContent = readFileSync(commandFile, 'utf-8');
    // Replace argument placeholders
    let processedContent = replaceArguments(rawContent, args);
    // Expand file references
    const { expanded, files } = expandFileReferences(processedContent, projectDir);
    processedContent = expanded;
    // Generate summary
    const firstLine = rawContent.split('\n')[0].trim();
    const summary = firstLine.startsWith('#')
        ? firstLine.replace(/^#+\s*/, '')
        : `Command: ${name}`;
    return {
        expandedText: processedContent,
        summary,
        originalCommand: prompt,
        referencedFiles: files,
    };
}
/**
 * List available slash commands in a project
 *
 * @param projectDir - The project root directory
 * @returns Object with project and user command names
 */
export function listAvailableCommands(projectDir) {
    const result = { project: [], user: [] };
    const projectCommandsDir = join(projectDir, '.claude', 'commands');
    const userCommandsDir = join(homedir(), '.claude', 'commands');
    function scanDir(dir, prefix = '') {
        if (!existsSync(dir))
            return [];
        const commands = [];
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Recurse into subdirectories
                    const nested = scanDir(join(dir, entry.name), `${prefix}${entry.name}:`);
                    commands.push(...nested);
                }
                else if (entry.isFile()) {
                    // Add command name (strip .md extension if present)
                    const name = entry.name.replace(/\.md$/, '');
                    commands.push(`${prefix}${name}`);
                }
            }
        }
        catch {
            // Ignore permission errors
        }
        return commands;
    }
    result.project = scanDir(projectCommandsDir);
    result.user = scanDir(userCommandsDir);
    return result;
}
//# sourceMappingURL=slashCommands.js.map
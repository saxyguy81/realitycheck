import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { INTEGRATION_CONFIG } from './config.js';
/**
 * Create an isolated test project with git and RealityCheck hooks
 */
export function createTestProject(options = {}) {
    const { name = 'test', withSlashCommands = false, customConfig = {} } = options;
    // Create temp directory
    const dir = join(tmpdir(), `realitycheck-integration-${name}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    // Initialize git
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@realitycheck.test"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "RealityCheck Test"', { cwd: dir, stdio: 'pipe' });
    // Create initial file and commit
    writeFileSync(join(dir, 'README.md'), `# Test Project: ${name}\n`);
    execSync('git add .', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: dir, stdio: 'pipe' });
    // Create .claude directory
    const claudeDir = join(dir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    // Write hooks configuration
    const hooksConfig = {
        hooks: {
            UserPromptSubmit: [{
                    hooks: [{ type: 'command', command: 'realitycheck', timeout: 10 }]
                }],
            PostToolUse: [{
                    matcher: 'Bash',
                    hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }]
                }],
            Stop: [{
                    hooks: [{ type: 'command', command: 'realitycheck', timeout: 60 }]
                }],
            SessionStart: [{
                    hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }]
                }],
        },
    };
    writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify(hooksConfig, null, 2));
    // Write RealityCheck config
    const realitycheckConfig = {
        judge: {
            model: 'opus',
            timeout: 30000,
        },
        limits: INTEGRATION_CONFIG.testLimits,
        ...customConfig,
    };
    writeFileSync(join(claudeDir, 'realitycheck.config.json'), JSON.stringify(realitycheckConfig, null, 2));
    // Create slash commands if requested
    if (withSlashCommands) {
        const commandsDir = join(claudeDir, 'commands');
        mkdirSync(commandsDir, { recursive: true });
        writeFileSync(join(commandsDir, 'test-command.md'), '# Test Command\n\nThis is a test slash command that says: $ARGUMENTS');
        writeFileSync(join(commandsDir, 'file-ref.md'), '# File Reference Command\n\nReview this file: @README.md');
    }
    const ledgerPath = join(dir, '.claude', 'realitycheck', 'task_ledger.json');
    const getLedger = () => {
        if (!existsSync(ledgerPath))
            return null;
        try {
            return JSON.parse(readFileSync(ledgerPath, 'utf-8'));
        }
        catch {
            return null;
        }
    };
    const getActiveDirectives = () => {
        const ledger = getLedger();
        if (!ledger)
            return [];
        return ledger.directives.filter(d => d.status === 'active');
    };
    const getStopAttempts = () => {
        const ledger = getLedger();
        if (!ledger)
            return [];
        return ledger.stopAttempts;
    };
    const cleanup = () => {
        if (existsSync(dir)) {
            rmSync(dir, { recursive: true, force: true });
        }
    };
    return {
        dir,
        cleanup,
        ledgerPath,
        getLedger,
        getActiveDirectives,
        getStopAttempts,
    };
}
//# sourceMappingURL=testProjectFactory.js.map
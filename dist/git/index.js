import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
export class GitManager {
    projectDir;
    constructor(projectDir) {
        this.projectDir = projectDir;
    }
    /**
     * Check if directory is a git repo
     */
    isGitRepo() {
        try {
            execSync('git rev-parse --git-dir', {
                cwd: this.projectDir,
                stdio: 'pipe',
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get current git status
     */
    getStatus() {
        if (!this.isGitRepo()) {
            return { isRepo: false, dirtyFiles: [], untrackedFiles: [] };
        }
        try {
            const headCommit = execSync('git rev-parse HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            }).trim();
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            }).trim();
            const statusOutput = execSync('git status --porcelain', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const dirtyFiles = [];
            const untrackedFiles = [];
            for (const line of statusOutput.split('\n').filter(Boolean)) {
                const status = line.substring(0, 2);
                const file = line.substring(3);
                if (status === '??') {
                    untrackedFiles.push(file);
                }
                else {
                    dirtyFiles.push(file);
                }
            }
            return {
                isRepo: true,
                headCommit,
                branch,
                dirtyFiles,
                untrackedFiles,
            };
        }
        catch {
            return { isRepo: true, dirtyFiles: [], untrackedFiles: [] };
        }
    }
    /**
     * Compute workspace fingerprint (hash of current diff state)
     */
    computeFingerprint() {
        if (!this.isGitRepo()) {
            // Fallback: hash of file mtimes for tracked files
            return this.computeNonGitFingerprint();
        }
        try {
            // Get both staged and unstaged changes
            const diff = execSync('git diff HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                maxBuffer: 10 * 1024 * 1024, // 10MB
            });
            const status = execSync('git status --porcelain', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const combined = `${diff}\n---STATUS---\n${status}`;
            return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
        }
        catch {
            return this.computeNonGitFingerprint();
        }
    }
    computeNonGitFingerprint() {
        // Simple fingerprint based on package.json mtime and src/ files
        const files = ['package.json', 'tsconfig.json'];
        const mtimes = [];
        for (const file of files) {
            const filePath = path.join(this.projectDir, file);
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                mtimes.push(`${file}:${stat.mtimeMs}`);
            }
        }
        return crypto.createHash('sha256').update(mtimes.join(',')).digest('hex').substring(0, 16);
    }
    /**
     * Get diff since a baseline commit
     */
    getDiffSince(baselineCommit) {
        if (!this.isGitRepo())
            return null;
        try {
            const diffStat = execSync(`git diff --stat ${baselineCommit}`, {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const diffNumstat = execSync(`git diff --numstat ${baselineCommit}`, {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const files = diffNumstat.split('\n').filter(Boolean).map(line => {
                const [additions, deletions, filePath] = line.split('\t');
                return {
                    path: filePath,
                    status: 'modified',
                    additions: parseInt(additions) || 0,
                    deletions: parseInt(deletions) || 0,
                };
            });
            return {
                files,
                summary: diffStat,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * Get current diff (uncommitted changes)
     */
    getCurrentDiff(options) {
        if (!this.isGitRepo())
            return null;
        const maxSize = options?.maxSize ?? 50000; // 50KB default
        try {
            const diffStat = execSync('git diff --stat HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const diffNumstat = execSync('git diff --numstat HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            let patch;
            try {
                const fullPatch = execSync('git diff HEAD', {
                    cwd: this.projectDir,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    maxBuffer: maxSize,
                });
                if (fullPatch.length < maxSize) {
                    patch = fullPatch;
                }
            }
            catch {
                // Patch too large, skip it
            }
            const files = diffNumstat.split('\n').filter(Boolean).map(line => {
                const [additions, deletions, filePath] = line.split('\t');
                return {
                    path: filePath,
                    status: 'modified',
                    additions: parseInt(additions) || 0,
                    deletions: parseInt(deletions) || 0,
                };
            });
            return {
                files,
                summary: diffStat,
                patch,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * Create baseline snapshot
     */
    async createBaseline(snapshotDir) {
        const status = this.getStatus();
        const timestamp = new Date().toISOString();
        // Snapshot dirty files (copy them for later comparison)
        if (status.dirtyFiles.length > 0 || status.untrackedFiles.length > 0) {
            fs.mkdirSync(snapshotDir, { recursive: true });
            const allDirty = [...status.dirtyFiles, ...status.untrackedFiles];
            for (const file of allDirty) {
                const srcPath = path.join(this.projectDir, file);
                const destPath = path.join(snapshotDir, file);
                if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }
        return {
            headCommit: status.headCommit,
            timestamp,
            dirtyFiles: [...status.dirtyFiles, ...status.untrackedFiles],
        };
    }
}
//# sourceMappingURL=index.js.map
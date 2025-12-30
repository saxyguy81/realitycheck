export interface GitStatus {
    isRepo: boolean;
    headCommit?: string;
    branch?: string;
    dirtyFiles: string[];
    untrackedFiles: string[];
}
export interface GitDiff {
    files: Array<{
        path: string;
        status: 'added' | 'modified' | 'deleted' | 'renamed';
        additions: number;
        deletions: number;
    }>;
    summary: string;
    patch?: string;
}
export declare class GitManager {
    private projectDir;
    constructor(projectDir: string);
    /**
     * Check if directory is a git repo
     */
    isGitRepo(): boolean;
    /**
     * Get current git status
     */
    getStatus(): GitStatus;
    /**
     * Compute workspace fingerprint (hash of current diff state)
     */
    computeFingerprint(): string;
    private computeNonGitFingerprint;
    /**
     * Get diff since a baseline commit
     */
    getDiffSince(baselineCommit: string): GitDiff | null;
    /**
     * Get current diff (uncommitted changes)
     */
    getCurrentDiff(options?: {
        maxSize?: number;
    }): GitDiff | null;
    /**
     * Create baseline snapshot
     */
    createBaseline(snapshotDir: string): Promise<{
        headCommit?: string;
        timestamp: string;
        dirtyFiles: string[];
    }>;
}
//# sourceMappingURL=index.d.ts.map
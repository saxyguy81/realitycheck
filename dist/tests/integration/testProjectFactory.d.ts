export interface TestProject {
    dir: string;
    cleanup: () => void;
    ledgerPath: string;
    getLedger: () => TaskLedger | null;
    getActiveDirectives: () => Directive[];
    getStopAttempts: () => StopAttempt[];
}
interface TaskLedger {
    version: number;
    sessionId: string;
    directives: Directive[];
    stopAttempts: StopAttempt[];
    fingerprints: Array<{
        hash: string;
        timestamp: string;
    }>;
    gitBaseline?: {
        branch: string;
        commitHash: string;
    };
}
interface Directive {
    id: string;
    rawText: string;
    type: 'initial' | 'followup' | 'clarification';
    status: 'active' | 'completed' | 'superseded' | 'abandoned';
    createdAt: string;
    completedAt?: string;
    normalizedIntent?: string;
}
interface StopAttempt {
    id: string;
    timestamp: string;
    verdict: 'complete' | 'incomplete' | 'blocked' | 'error';
    reason: string;
}
/**
 * Create an isolated test project with git and RealityCheck hooks
 */
export declare function createTestProject(options?: {
    name?: string;
    withSlashCommands?: boolean;
    customConfig?: Record<string, unknown>;
}): TestProject;
export {};
//# sourceMappingURL=testProjectFactory.d.ts.map
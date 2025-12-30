import { TaskLedger, Directive, DirectiveType, DirectiveStatus, StopAttempt, GitBaseline, WorkspaceFingerprint, ProgressAnalysis, LimitCheckResult } from '../types/index.js';
import { RealityCheckConfig } from '../config/index.js';
/**
 * Manages the Task Ledger - persistent state for RealityCheck
 * Handles loading, saving, and querying the ledger data
 */
export declare class LedgerManager {
    private ledger;
    private readonly config;
    private readonly projectDir;
    private readonly ledgerPath;
    constructor(config: RealityCheckConfig, projectDir: string);
    /**
     * Initialize the ledger - load existing or create new
     * Creates the storage directory if it doesn't exist
     */
    initialize(): Promise<void>;
    /**
     * Create an empty ledger with initial values
     */
    private createEmptyLedger;
    /**
     * Save the ledger to disk
     */
    private save;
    /**
     * Ensure ledger is initialized before operations
     */
    private ensureInitialized;
    /**
     * Add a new directive (user prompt/task)
     *
     * @param rawText - The raw text of the user's prompt
     * @param type - The type of directive (initial, followup, clarification)
     * @param normalizedIntent - Optional normalized/extracted intent
     * @returns The created directive
     */
    addDirective(rawText: string, type: DirectiveType, normalizedIntent?: string): Promise<Directive>;
    /**
     * Update the status of a directive
     *
     * @param directiveId - The ID of the directive to update
     * @param status - The new status
     */
    updateDirectiveStatus(directiveId: string, status: DirectiveStatus): Promise<void>;
    /**
     * Record a stop attempt with judge evaluation
     *
     * @param attempt - The stop attempt data (without id/timestamp)
     * @returns The recorded attempt with generated id and timestamp
     */
    recordStopAttempt(attempt: Omit<StopAttempt, 'id' | 'timestamp'>): Promise<StopAttempt>;
    /**
     * Record a workspace fingerprint
     *
     * @param hash - The fingerprint hash
     * @param afterCommand - Optional command that triggered this fingerprint
     */
    recordFingerprint(hash: string, afterCommand?: string): Promise<void>;
    /**
     * Set the git baseline information
     *
     * @param baseline - The git baseline data
     */
    setBaseline(baseline: GitBaseline): Promise<void>;
    /**
     * Get all active (non-superseded, non-completed) directives
     */
    getActiveDirectives(): Directive[];
    /**
     * Get all directives
     */
    getAllDirectives(): Directive[];
    /**
     * Get all stop attempts
     */
    getStopAttempts(): StopAttempt[];
    /**
     * Get the git baseline
     */
    getBaseline(): GitBaseline | undefined;
    /**
     * Get all fingerprints
     */
    getFingerprints(): WorkspaceFingerprint[];
    /**
     * Get the current session ID
     */
    getSessionId(): string;
    /**
     * Check if limits have been exceeded
     */
    checkLimits(): LimitCheckResult;
    /**
     * Analyze progress trend based on stop attempts and fingerprints
     */
    analyzeProgress(): ProgressAnalysis;
    /**
     * Reset the ledger for a new task (clears all data)
     */
    reset(): Promise<void>;
    /**
     * Get a read-only snapshot of the full ledger
     */
    getSnapshot(): TaskLedger;
}
//# sourceMappingURL=index.d.ts.map
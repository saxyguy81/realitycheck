import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TaskLedgerSchema, } from '../types/index.js';
import { getStoragePath, getLedgerPath } from '../config/index.js';
// =============================================================================
// LedgerManager Class
// =============================================================================
/**
 * Manages the Task Ledger - persistent state for RealityCheck
 * Handles loading, saving, and querying the ledger data
 */
export class LedgerManager {
    ledger = null;
    config;
    projectDir;
    ledgerPath;
    constructor(config, projectDir) {
        this.config = config;
        this.projectDir = projectDir;
        this.ledgerPath = getLedgerPath(config, projectDir);
    }
    /**
     * Initialize the ledger - load existing or create new
     * Creates the storage directory if it doesn't exist
     */
    async initialize() {
        const storageDir = getStoragePath(this.config, this.projectDir);
        // Ensure storage directory exists
        if (!existsSync(storageDir)) {
            mkdirSync(storageDir, { recursive: true });
        }
        // Try to load existing ledger
        if (existsSync(this.ledgerPath)) {
            try {
                const rawData = readFileSync(this.ledgerPath, 'utf-8');
                const parsed = JSON.parse(rawData);
                this.ledger = TaskLedgerSchema.parse(parsed);
                this.ledger.updatedAt = new Date().toISOString();
                await this.save();
                return;
            }
            catch (error) {
                // Handle corrupted file
                if (this.config.storage.archiveCorrupted) {
                    const archivePath = join(dirname(this.ledgerPath), `task_ledger.corrupted.${Date.now()}.json`);
                    try {
                        renameSync(this.ledgerPath, archivePath);
                        console.warn(`[RealityCheck] Archived corrupted ledger to ${archivePath}`);
                    }
                    catch {
                        console.warn('[RealityCheck] Failed to archive corrupted ledger');
                    }
                }
            }
        }
        // Create new ledger
        this.ledger = this.createEmptyLedger();
        await this.save();
    }
    /**
     * Create an empty ledger with initial values
     */
    createEmptyLedger() {
        const now = new Date().toISOString();
        return {
            version: 1,
            sessionId: randomUUID(),
            createdAt: now,
            updatedAt: now,
            directives: [],
            criteria: [],
            stopAttempts: [],
            fingerprints: [],
        };
    }
    /**
     * Save the ledger to disk
     */
    async save() {
        if (!this.ledger) {
            throw new Error('Ledger not initialized');
        }
        this.ledger.updatedAt = new Date().toISOString();
        const dir = dirname(this.ledgerPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(this.ledgerPath, JSON.stringify(this.ledger, null, 2), 'utf-8');
    }
    /**
     * Ensure ledger is initialized before operations
     */
    ensureInitialized() {
        if (!this.ledger) {
            throw new Error('Ledger not initialized. Call initialize() first.');
        }
        return this.ledger;
    }
    /**
     * Add a new directive (user prompt/task)
     *
     * @param rawText - The raw text of the user's prompt
     * @param type - The type of directive (initial, followup, clarification)
     * @param normalizedIntent - Optional normalized/extracted intent
     * @returns The created directive
     */
    async addDirective(rawText, type, normalizedIntent) {
        const ledger = this.ensureInitialized();
        const directive = {
            id: randomUUID(),
            rawText,
            normalizedIntent,
            type,
            status: 'active',
            createdAt: new Date().toISOString(),
        };
        ledger.directives.push(directive);
        await this.save();
        return directive;
    }
    /**
     * Update the status of a directive
     *
     * @param directiveId - The ID of the directive to update
     * @param status - The new status
     */
    async updateDirectiveStatus(directiveId, status) {
        const ledger = this.ensureInitialized();
        const directive = ledger.directives.find((d) => d.id === directiveId);
        if (!directive) {
            throw new Error(`Directive not found: ${directiveId}`);
        }
        directive.status = status;
        if (status === 'completed') {
            directive.completedAt = new Date().toISOString();
        }
        await this.save();
    }
    /**
     * Record a stop attempt with judge evaluation
     *
     * @param attempt - The stop attempt data (without id/timestamp)
     * @returns The recorded attempt with generated id and timestamp
     */
    async recordStopAttempt(attempt) {
        const ledger = this.ensureInitialized();
        const fullAttempt = {
            ...attempt,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
        };
        ledger.stopAttempts.push(fullAttempt);
        await this.save();
        return fullAttempt;
    }
    /**
     * Record a workspace fingerprint
     *
     * @param hash - The fingerprint hash
     * @param afterCommand - Optional command that triggered this fingerprint
     */
    async recordFingerprint(hash, afterCommand) {
        const ledger = this.ensureInitialized();
        const fingerprint = {
            hash,
            timestamp: new Date().toISOString(),
            afterCommand,
        };
        ledger.fingerprints.push(fingerprint);
        await this.save();
    }
    /**
     * Set the git baseline information
     *
     * @param baseline - The git baseline data
     */
    async setBaseline(baseline) {
        const ledger = this.ensureInitialized();
        ledger.gitBaseline = baseline;
        await this.save();
    }
    /**
     * Get all active (non-superseded, non-completed) directives
     */
    getActiveDirectives() {
        const ledger = this.ensureInitialized();
        return ledger.directives.filter((d) => d.status === 'active');
    }
    /**
     * Get all directives
     */
    getAllDirectives() {
        const ledger = this.ensureInitialized();
        return [...ledger.directives];
    }
    /**
     * Get all stop attempts
     */
    getStopAttempts() {
        const ledger = this.ensureInitialized();
        return [...ledger.stopAttempts];
    }
    /**
     * Get the git baseline
     */
    getBaseline() {
        const ledger = this.ensureInitialized();
        return ledger.gitBaseline;
    }
    /**
     * Get all fingerprints
     */
    getFingerprints() {
        const ledger = this.ensureInitialized();
        return [...ledger.fingerprints];
    }
    /**
     * Get the current session ID
     */
    getSessionId() {
        const ledger = this.ensureInitialized();
        return ledger.sessionId;
    }
    /**
     * Check if limits have been exceeded
     */
    checkLimits() {
        const ledger = this.ensureInitialized();
        const { maxConsecutiveFailures, maxTotalAttempts } = this.config.limits;
        const totalAttempts = ledger.stopAttempts.length;
        // Count consecutive failures (from most recent)
        let consecutiveFailures = 0;
        for (let i = ledger.stopAttempts.length - 1; i >= 0; i--) {
            if (ledger.stopAttempts[i].verdict === 'incomplete') {
                consecutiveFailures++;
            }
            else {
                break;
            }
        }
        if (consecutiveFailures >= maxConsecutiveFailures) {
            return {
                exceeded: true,
                reason: `Consecutive failures (${consecutiveFailures}) exceeded limit (${maxConsecutiveFailures})`,
                consecutiveFailures,
                totalAttempts,
            };
        }
        if (totalAttempts >= maxTotalAttempts) {
            return {
                exceeded: true,
                reason: `Total attempts (${totalAttempts}) exceeded limit (${maxTotalAttempts})`,
                consecutiveFailures,
                totalAttempts,
            };
        }
        return {
            exceeded: false,
            consecutiveFailures,
            totalAttempts,
        };
    }
    /**
     * Analyze progress trend based on stop attempts and fingerprints
     */
    analyzeProgress() {
        const ledger = this.ensureInitialized();
        const { noProgressThreshold } = this.config.limits;
        const totalAttempts = ledger.stopAttempts.length;
        // Count consecutive failures
        let consecutiveFailures = 0;
        for (let i = ledger.stopAttempts.length - 1; i >= 0; i--) {
            if (ledger.stopAttempts[i].verdict === 'incomplete') {
                consecutiveFailures++;
            }
            else {
                break;
            }
        }
        // Count unique fingerprints in recent attempts
        const recentFingerprints = ledger.fingerprints.slice(-noProgressThreshold);
        const uniqueFingerprints = new Set(recentFingerprints.map((f) => f.hash)).size;
        // Determine trend
        let trend;
        let recommendation;
        if (consecutiveFailures === 0) {
            trend = 'improving';
        }
        else if (consecutiveFailures >= noProgressThreshold) {
            if (uniqueFingerprints <= 1) {
                trend = 'stagnant';
                recommendation = 'No progress detected. Consider asking for user clarification.';
            }
            else if (uniqueFingerprints < consecutiveFailures / 2) {
                trend = 'regressing';
                recommendation = 'Possible loop detected. Work is being undone and redone.';
            }
            else {
                trend = 'stagnant';
                recommendation = 'Multiple attempts without success. May need different approach.';
            }
        }
        else {
            trend = 'improving';
        }
        return {
            trend,
            consecutiveFailures,
            totalAttempts,
            uniqueFingerprints,
            recommendation,
        };
    }
    /**
     * Reset the ledger for a new task (clears all data)
     */
    async reset() {
        this.ledger = this.createEmptyLedger();
        await this.save();
    }
    /**
     * Get a read-only snapshot of the full ledger
     */
    getSnapshot() {
        return { ...this.ensureInitialized() };
    }
}
//# sourceMappingURL=index.js.map
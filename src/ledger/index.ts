import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  TaskLedger,
  TaskLedgerSchema,
  Directive,
  DirectiveType,
  DirectiveStatus,
  StopAttempt,
  GitBaseline,
  WorkspaceFingerprint,
  ProgressAnalysis,
  ProgressTrend,
  LimitCheckResult,
} from '../types/index.js';
import { RealityCheckConfig, getStoragePath, getLedgerPath } from '../config/index.js';

// =============================================================================
// LedgerManager Class
// =============================================================================

/**
 * Manages the Task Ledger - persistent state for RealityCheck
 * Handles loading, saving, and querying the ledger data
 */
export class LedgerManager {
  private ledger: TaskLedger | null = null;
  private readonly config: RealityCheckConfig;
  private readonly projectDir: string;
  private readonly ledgerPath: string;

  constructor(config: RealityCheckConfig, projectDir: string) {
    this.config = config;
    this.projectDir = projectDir;
    this.ledgerPath = getLedgerPath(config, projectDir);
  }

  /**
   * Initialize the ledger - load existing or create new
   * Creates the storage directory if it doesn't exist
   */
  async initialize(): Promise<void> {
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
      } catch (error) {
        // Handle corrupted file
        if (this.config.storage.archiveCorrupted) {
          const archivePath = join(
            dirname(this.ledgerPath),
            `task_ledger.corrupted.${Date.now()}.json`
          );
          try {
            renameSync(this.ledgerPath, archivePath);
            console.warn(`[RealityCheck] Archived corrupted ledger to ${archivePath}`);
          } catch {
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
  private createEmptyLedger(): TaskLedger {
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
  private async save(): Promise<void> {
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
  private ensureInitialized(): TaskLedger {
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
  async addDirective(
    rawText: string,
    type: DirectiveType,
    normalizedIntent?: string
  ): Promise<Directive> {
    const ledger = this.ensureInitialized();

    const directive: Directive = {
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
  async updateDirectiveStatus(
    directiveId: string,
    status: DirectiveStatus
  ): Promise<void> {
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
  async recordStopAttempt(
    attempt: Omit<StopAttempt, 'id' | 'timestamp'>
  ): Promise<StopAttempt> {
    const ledger = this.ensureInitialized();

    const fullAttempt: StopAttempt = {
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
  async recordFingerprint(hash: string, afterCommand?: string): Promise<void> {
    const ledger = this.ensureInitialized();

    const fingerprint: WorkspaceFingerprint = {
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
  async setBaseline(baseline: GitBaseline): Promise<void> {
    const ledger = this.ensureInitialized();
    ledger.gitBaseline = baseline;
    await this.save();
  }

  /**
   * Get all active (non-superseded, non-completed) directives
   */
  getActiveDirectives(): Directive[] {
    const ledger = this.ensureInitialized();
    return ledger.directives.filter(
      (d) => d.status === 'active'
    );
  }

  /**
   * Get all directives
   */
  getAllDirectives(): Directive[] {
    const ledger = this.ensureInitialized();
    return [...ledger.directives];
  }

  /**
   * Get all stop attempts
   */
  getStopAttempts(): StopAttempt[] {
    const ledger = this.ensureInitialized();
    return [...ledger.stopAttempts];
  }

  /**
   * Get the git baseline
   */
  getBaseline(): GitBaseline | undefined {
    const ledger = this.ensureInitialized();
    return ledger.gitBaseline;
  }

  /**
   * Get all fingerprints
   */
  getFingerprints(): WorkspaceFingerprint[] {
    const ledger = this.ensureInitialized();
    return [...ledger.fingerprints];
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    const ledger = this.ensureInitialized();
    return ledger.sessionId;
  }

  /**
   * Check if limits have been exceeded
   */
  checkLimits(): LimitCheckResult {
    const ledger = this.ensureInitialized();
    const { maxConsecutiveFailures, maxTotalAttempts } = this.config.limits;

    const totalAttempts = ledger.stopAttempts.length;

    // Count consecutive failures (from most recent)
    let consecutiveFailures = 0;
    for (let i = ledger.stopAttempts.length - 1; i >= 0; i--) {
      if (ledger.stopAttempts[i].verdict === 'incomplete') {
        consecutiveFailures++;
      } else {
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
  analyzeProgress(): ProgressAnalysis {
    const ledger = this.ensureInitialized();
    const { noProgressThreshold } = this.config.limits;

    const totalAttempts = ledger.stopAttempts.length;

    // Count consecutive failures
    let consecutiveFailures = 0;
    for (let i = ledger.stopAttempts.length - 1; i >= 0; i--) {
      if (ledger.stopAttempts[i].verdict === 'incomplete') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    // Count unique fingerprints in recent attempts
    const recentFingerprints = ledger.fingerprints.slice(-noProgressThreshold);
    const uniqueFingerprints = new Set(recentFingerprints.map((f) => f.hash)).size;

    // Determine trend
    let trend: ProgressTrend;
    let recommendation: string | undefined;

    if (consecutiveFailures === 0) {
      trend = 'improving';
    } else if (consecutiveFailures >= noProgressThreshold) {
      if (uniqueFingerprints <= 1) {
        trend = 'stagnant';
        recommendation = 'No progress detected. Consider asking for user clarification.';
      } else if (uniqueFingerprints < consecutiveFailures / 2) {
        trend = 'regressing';
        recommendation = 'Possible loop detected. Work is being undone and redone.';
      } else {
        trend = 'stagnant';
        recommendation = 'Multiple attempts without success. May need different approach.';
      }
    } else {
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
  async reset(): Promise<void> {
    this.ledger = this.createEmptyLedger();
    await this.save();
  }

  /**
   * Get a read-only snapshot of the full ledger
   */
  getSnapshot(): TaskLedger {
    return { ...this.ensureInitialized() };
  }
}

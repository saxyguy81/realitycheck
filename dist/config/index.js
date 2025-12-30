import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// =============================================================================
// Configuration Schema
// =============================================================================
/**
 * Judge configuration - controls the external Claude judge process
 */
export const JudgeConfigSchema = z.object({
    model: z.enum(['opus', 'sonnet', 'haiku']).default('opus'),
    timeout: z.number().min(5000).max(120000).default(30000),
    maxTokens: z.number().min(1000).max(16000).default(4096),
    executable: z.string().default('claude'),
});
/**
 * Limit configuration - controls retry and loop detection
 */
export const LimitsConfigSchema = z.object({
    maxConsecutiveFailures: z.number().min(1).max(100).default(20),
    maxTotalAttempts: z.number().min(1).max(200).default(50),
    noProgressThreshold: z.number().min(1).max(50).default(5),
});
/**
 * Storage configuration - where RealityCheck stores its data
 */
export const StorageConfigSchema = z.object({
    directory: z.string().default('.claude/realitycheck'),
    ledgerFilename: z.string().default('task_ledger.json'),
    archiveCorrupted: z.boolean().default(true),
});
/**
 * Git configuration - baseline and diff behavior
 */
export const GitConfigSchema = z.object({
    enabled: z.boolean().default(true),
    captureBaseline: z.boolean().default(true),
    includeDiff: z.boolean().default(true),
});
/**
 * Performance configuration - optimization settings
 */
export const PerformanceConfigSchema = z.object({
    fingerprintOnToolUse: z.boolean().default(false),
    lazyTranscriptLoad: z.boolean().default(true),
});
/**
 * Debug configuration - development and troubleshooting
 */
export const DebugConfigSchema = z.object({
    enabled: z.boolean().default(false),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    dryRun: z.boolean().default(false),
});
/**
 * Complete RealityCheck configuration
 */
export const RealityCheckConfigSchema = z.object({
    judge: JudgeConfigSchema.default({}),
    limits: LimitsConfigSchema.default({}),
    storage: StorageConfigSchema.default({}),
    git: GitConfigSchema.default({}),
    performance: PerformanceConfigSchema.default({}),
    debug: DebugConfigSchema.default({}),
});
// =============================================================================
// Configuration Loading
// =============================================================================
/**
 * Possible locations for the config file, in order of priority
 */
const CONFIG_LOCATIONS = [
    '.claude/realitycheck.config.json',
    'realitycheck.config.json',
];
/**
 * Load configuration from the project directory
 * Falls back to defaults if no config file exists or if parsing fails
 *
 * @param projectDir - The root directory of the project
 * @returns The merged configuration with defaults
 */
export function loadConfig(projectDir) {
    for (const location of CONFIG_LOCATIONS) {
        const configPath = join(projectDir, location);
        if (existsSync(configPath)) {
            try {
                const rawConfig = readFileSync(configPath, 'utf-8');
                const parsedConfig = JSON.parse(rawConfig);
                return RealityCheckConfigSchema.parse(parsedConfig);
            }
            catch (error) {
                // Log warning but continue with defaults
                console.warn(`[RealityCheck] Failed to load config from ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    // Return defaults if no config file found
    return RealityCheckConfigSchema.parse({});
}
/**
 * Get the storage path for RealityCheck data
 *
 * @param config - The RealityCheck configuration
 * @param projectDir - The root directory of the project
 * @returns The absolute path to the storage directory
 */
export function getStoragePath(config, projectDir) {
    return join(projectDir, config.storage.directory);
}
/**
 * Get the full path to the ledger file
 *
 * @param config - The RealityCheck configuration
 * @param projectDir - The root directory of the project
 * @returns The absolute path to the ledger JSON file
 */
export function getLedgerPath(config, projectDir) {
    return join(getStoragePath(config, projectDir), config.storage.ledgerFilename);
}
/**
 * Get default configuration (useful for testing)
 */
export function getDefaultConfig() {
    return RealityCheckConfigSchema.parse({});
}
//# sourceMappingURL=index.js.map
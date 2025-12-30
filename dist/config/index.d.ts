import { z } from 'zod';
/**
 * Judge configuration - controls the external Claude judge process
 */
export declare const JudgeConfigSchema: z.ZodObject<{
    model: z.ZodDefault<z.ZodEnum<["opus", "sonnet", "haiku"]>>;
    timeout: z.ZodDefault<z.ZodNumber>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    executable: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model: "opus" | "sonnet" | "haiku";
    timeout: number;
    maxTokens: number;
    executable: string;
}, {
    model?: "opus" | "sonnet" | "haiku" | undefined;
    timeout?: number | undefined;
    maxTokens?: number | undefined;
    executable?: string | undefined;
}>;
export type JudgeConfig = z.infer<typeof JudgeConfigSchema>;
/**
 * Limit configuration - controls retry and loop detection
 */
export declare const LimitsConfigSchema: z.ZodObject<{
    maxConsecutiveFailures: z.ZodDefault<z.ZodNumber>;
    maxTotalAttempts: z.ZodDefault<z.ZodNumber>;
    noProgressThreshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    maxConsecutiveFailures: number;
    maxTotalAttempts: number;
    noProgressThreshold: number;
}, {
    maxConsecutiveFailures?: number | undefined;
    maxTotalAttempts?: number | undefined;
    noProgressThreshold?: number | undefined;
}>;
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;
/**
 * Storage configuration - where RealityCheck stores its data
 */
export declare const StorageConfigSchema: z.ZodObject<{
    directory: z.ZodDefault<z.ZodString>;
    ledgerFilename: z.ZodDefault<z.ZodString>;
    archiveCorrupted: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    directory: string;
    ledgerFilename: string;
    archiveCorrupted: boolean;
}, {
    directory?: string | undefined;
    ledgerFilename?: string | undefined;
    archiveCorrupted?: boolean | undefined;
}>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
/**
 * Git configuration - baseline and diff behavior
 */
export declare const GitConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    captureBaseline: z.ZodDefault<z.ZodBoolean>;
    includeDiff: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    captureBaseline: boolean;
    includeDiff: boolean;
}, {
    enabled?: boolean | undefined;
    captureBaseline?: boolean | undefined;
    includeDiff?: boolean | undefined;
}>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
/**
 * Performance configuration - optimization settings
 */
export declare const PerformanceConfigSchema: z.ZodObject<{
    fingerprintOnToolUse: z.ZodDefault<z.ZodBoolean>;
    lazyTranscriptLoad: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    fingerprintOnToolUse: boolean;
    lazyTranscriptLoad: boolean;
}, {
    fingerprintOnToolUse?: boolean | undefined;
    lazyTranscriptLoad?: boolean | undefined;
}>;
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;
/**
 * Debug configuration - development and troubleshooting
 */
export declare const DebugConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    logLevel: z.ZodDefault<z.ZodEnum<["error", "warn", "info", "debug"]>>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    logLevel: "error" | "warn" | "info" | "debug";
    dryRun: boolean;
}, {
    enabled?: boolean | undefined;
    logLevel?: "error" | "warn" | "info" | "debug" | undefined;
    dryRun?: boolean | undefined;
}>;
export type DebugConfig = z.infer<typeof DebugConfigSchema>;
/**
 * Complete RealityCheck configuration
 */
export declare const RealityCheckConfigSchema: z.ZodObject<{
    judge: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodEnum<["opus", "sonnet", "haiku"]>>;
        timeout: z.ZodDefault<z.ZodNumber>;
        maxTokens: z.ZodDefault<z.ZodNumber>;
        executable: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model: "opus" | "sonnet" | "haiku";
        timeout: number;
        maxTokens: number;
        executable: string;
    }, {
        model?: "opus" | "sonnet" | "haiku" | undefined;
        timeout?: number | undefined;
        maxTokens?: number | undefined;
        executable?: string | undefined;
    }>>;
    limits: z.ZodDefault<z.ZodObject<{
        maxConsecutiveFailures: z.ZodDefault<z.ZodNumber>;
        maxTotalAttempts: z.ZodDefault<z.ZodNumber>;
        noProgressThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxConsecutiveFailures: number;
        maxTotalAttempts: number;
        noProgressThreshold: number;
    }, {
        maxConsecutiveFailures?: number | undefined;
        maxTotalAttempts?: number | undefined;
        noProgressThreshold?: number | undefined;
    }>>;
    storage: z.ZodDefault<z.ZodObject<{
        directory: z.ZodDefault<z.ZodString>;
        ledgerFilename: z.ZodDefault<z.ZodString>;
        archiveCorrupted: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        directory: string;
        ledgerFilename: string;
        archiveCorrupted: boolean;
    }, {
        directory?: string | undefined;
        ledgerFilename?: string | undefined;
        archiveCorrupted?: boolean | undefined;
    }>>;
    git: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        captureBaseline: z.ZodDefault<z.ZodBoolean>;
        includeDiff: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        captureBaseline: boolean;
        includeDiff: boolean;
    }, {
        enabled?: boolean | undefined;
        captureBaseline?: boolean | undefined;
        includeDiff?: boolean | undefined;
    }>>;
    performance: z.ZodDefault<z.ZodObject<{
        fingerprintOnToolUse: z.ZodDefault<z.ZodBoolean>;
        lazyTranscriptLoad: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        fingerprintOnToolUse: boolean;
        lazyTranscriptLoad: boolean;
    }, {
        fingerprintOnToolUse?: boolean | undefined;
        lazyTranscriptLoad?: boolean | undefined;
    }>>;
    debug: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        logLevel: z.ZodDefault<z.ZodEnum<["error", "warn", "info", "debug"]>>;
        dryRun: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        logLevel: "error" | "warn" | "info" | "debug";
        dryRun: boolean;
    }, {
        enabled?: boolean | undefined;
        logLevel?: "error" | "warn" | "info" | "debug" | undefined;
        dryRun?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    debug: {
        enabled: boolean;
        logLevel: "error" | "warn" | "info" | "debug";
        dryRun: boolean;
    };
    judge: {
        model: "opus" | "sonnet" | "haiku";
        timeout: number;
        maxTokens: number;
        executable: string;
    };
    limits: {
        maxConsecutiveFailures: number;
        maxTotalAttempts: number;
        noProgressThreshold: number;
    };
    storage: {
        directory: string;
        ledgerFilename: string;
        archiveCorrupted: boolean;
    };
    git: {
        enabled: boolean;
        captureBaseline: boolean;
        includeDiff: boolean;
    };
    performance: {
        fingerprintOnToolUse: boolean;
        lazyTranscriptLoad: boolean;
    };
}, {
    debug?: {
        enabled?: boolean | undefined;
        logLevel?: "error" | "warn" | "info" | "debug" | undefined;
        dryRun?: boolean | undefined;
    } | undefined;
    judge?: {
        model?: "opus" | "sonnet" | "haiku" | undefined;
        timeout?: number | undefined;
        maxTokens?: number | undefined;
        executable?: string | undefined;
    } | undefined;
    limits?: {
        maxConsecutiveFailures?: number | undefined;
        maxTotalAttempts?: number | undefined;
        noProgressThreshold?: number | undefined;
    } | undefined;
    storage?: {
        directory?: string | undefined;
        ledgerFilename?: string | undefined;
        archiveCorrupted?: boolean | undefined;
    } | undefined;
    git?: {
        enabled?: boolean | undefined;
        captureBaseline?: boolean | undefined;
        includeDiff?: boolean | undefined;
    } | undefined;
    performance?: {
        fingerprintOnToolUse?: boolean | undefined;
        lazyTranscriptLoad?: boolean | undefined;
    } | undefined;
}>;
export type RealityCheckConfig = z.infer<typeof RealityCheckConfigSchema>;
/**
 * Load configuration from the project directory
 * Falls back to defaults if no config file exists or if parsing fails
 *
 * @param projectDir - The root directory of the project
 * @returns The merged configuration with defaults
 */
export declare function loadConfig(projectDir: string): RealityCheckConfig;
/**
 * Get the storage path for RealityCheck data
 *
 * @param config - The RealityCheck configuration
 * @param projectDir - The root directory of the project
 * @returns The absolute path to the storage directory
 */
export declare function getStoragePath(config: RealityCheckConfig, projectDir: string): string;
/**
 * Get the full path to the ledger file
 *
 * @param config - The RealityCheck configuration
 * @param projectDir - The root directory of the project
 * @returns The absolute path to the ledger JSON file
 */
export declare function getLedgerPath(config: RealityCheckConfig, projectDir: string): string;
/**
 * Get default configuration (useful for testing)
 */
export declare function getDefaultConfig(): RealityCheckConfig;
//# sourceMappingURL=index.d.ts.map
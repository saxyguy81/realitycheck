import { z } from 'zod';
/**
 * Base schema for all hook inputs - common fields across all hook types
 */
export declare const BaseHookInputSchema: z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
}, {
    session_id: string;
    transcript_path: string;
}>;
export type BaseHookInput = z.infer<typeof BaseHookInputSchema>;
/**
 * UserPromptSubmit hook - fired when user submits a new prompt
 */
export declare const UserPromptSubmitInputSchema: z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"UserPromptSubmit">;
    prompt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "UserPromptSubmit";
    prompt: string;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "UserPromptSubmit";
    prompt: string;
}>;
export type UserPromptSubmitInput = z.infer<typeof UserPromptSubmitInputSchema>;
/**
 * Stop hook - fired when Claude attempts to stop/complete the task
 * Includes stop_hook_active to detect recursion (judge calling stop)
 */
export declare const StopHookInputSchema: z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"Stop">;
    stop_hook_active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "Stop";
    stop_hook_active: boolean;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "Stop";
    stop_hook_active?: boolean | undefined;
}>;
export type StopHookInput = z.infer<typeof StopHookInputSchema>;
/**
 * PostToolUse hook - fired after a tool is executed
 */
export declare const PostToolUseInputSchema: z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"PostToolUse">;
    tool_name: z.ZodString;
    tool_input: z.ZodUnknown;
    tool_output: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "PostToolUse";
    tool_name: string;
    tool_input?: unknown;
    tool_output?: unknown;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "PostToolUse";
    tool_name: string;
    tool_input?: unknown;
    tool_output?: unknown;
}>;
export type PostToolUseInput = z.infer<typeof PostToolUseInputSchema>;
/**
 * SessionStart hook - fired when a new Claude Code session begins
 */
export declare const SessionStartInputSchema: z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"SessionStart">;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "SessionStart";
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "SessionStart";
}>;
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;
/**
 * Union of all hook input types
 */
export declare const HookInputSchema: z.ZodDiscriminatedUnion<"hook_type", [z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"UserPromptSubmit">;
    prompt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "UserPromptSubmit";
    prompt: string;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "UserPromptSubmit";
    prompt: string;
}>, z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"Stop">;
    stop_hook_active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "Stop";
    stop_hook_active: boolean;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "Stop";
    stop_hook_active?: boolean | undefined;
}>, z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"PostToolUse">;
    tool_name: z.ZodString;
    tool_input: z.ZodUnknown;
    tool_output: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "PostToolUse";
    tool_name: string;
    tool_input?: unknown;
    tool_output?: unknown;
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "PostToolUse";
    tool_name: string;
    tool_input?: unknown;
    tool_output?: unknown;
}>, z.ZodObject<{
    session_id: z.ZodString;
    transcript_path: z.ZodString;
} & {
    hook_type: z.ZodLiteral<"SessionStart">;
}, "strip", z.ZodTypeAny, {
    session_id: string;
    transcript_path: string;
    hook_type: "SessionStart";
}, {
    session_id: string;
    transcript_path: string;
    hook_type: "SessionStart";
}>]>;
export type HookInput = z.infer<typeof HookInputSchema>;
/**
 * Decision schema for hook responses
 * - continue: Allow the action to proceed
 * - block: Prevent the action with a message
 */
export declare const HookDecisionSchema: z.ZodDiscriminatedUnion<"decision", [z.ZodObject<{
    decision: z.ZodLiteral<"continue">;
}, "strip", z.ZodTypeAny, {
    decision: "continue";
}, {
    decision: "continue";
}>, z.ZodObject<{
    decision: z.ZodLiteral<"block">;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    decision: "block";
    reason: string;
}, {
    decision: "block";
    reason: string;
}>]>;
export type HookDecision = z.infer<typeof HookDecisionSchema>;
/**
 * Status of a user directive/task
 */
export declare const DirectiveStatusSchema: z.ZodEnum<["active", "superseded", "completed", "abandoned"]>;
export type DirectiveStatus = z.infer<typeof DirectiveStatusSchema>;
/**
 * Type of directive - how it was captured
 */
export declare const DirectiveTypeSchema: z.ZodEnum<["initial", "followup", "clarification"]>;
export type DirectiveType = z.infer<typeof DirectiveTypeSchema>;
/**
 * A user directive/task to be completed
 */
export declare const DirectiveSchema: z.ZodObject<{
    id: z.ZodString;
    rawText: z.ZodString;
    normalizedIntent: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["initial", "followup", "clarification"]>;
    status: z.ZodEnum<["active", "superseded", "completed", "abandoned"]>;
    createdAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "initial" | "followup" | "clarification";
    status: "active" | "superseded" | "completed" | "abandoned";
    id: string;
    rawText: string;
    createdAt: string;
    normalizedIntent?: string | undefined;
    completedAt?: string | undefined;
}, {
    type: "initial" | "followup" | "clarification";
    status: "active" | "superseded" | "completed" | "abandoned";
    id: string;
    rawText: string;
    createdAt: string;
    normalizedIntent?: string | undefined;
    completedAt?: string | undefined;
}>;
export type Directive = z.infer<typeof DirectiveSchema>;
/**
 * An acceptance criterion extracted from a directive
 */
export declare const AcceptanceCriterionSchema: z.ZodObject<{
    id: z.ZodString;
    directiveId: z.ZodString;
    description: z.ZodString;
    verified: z.ZodDefault<z.ZodBoolean>;
    verifiedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    directiveId: string;
    description: string;
    verified: boolean;
    verifiedAt?: string | undefined;
}, {
    id: string;
    directiveId: string;
    description: string;
    verified?: boolean | undefined;
    verifiedAt?: string | undefined;
}>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
/**
 * Verdict status for recording stop attempts
 * Note: This is the simple status enum, not the full judge verdict object
 */
export declare const VerdictStatusSchema: z.ZodEnum<["complete", "incomplete", "blocked", "error"]>;
export type VerdictStatus = z.infer<typeof VerdictStatusSchema>;
/**
 * Record of a stop attempt and judge evaluation
 */
export declare const StopAttemptSchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    verdict: z.ZodEnum<["complete", "incomplete", "blocked", "error"]>;
    reason: z.ZodString;
    fingerprintBefore: z.ZodOptional<z.ZodString>;
    fingerprintAfter: z.ZodOptional<z.ZodString>;
    criteriaEvaluated: z.ZodOptional<z.ZodArray<z.ZodObject<{
        criterionId: z.ZodString;
        passed: z.ZodBoolean;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        criterionId: string;
        passed: boolean;
        notes?: string | undefined;
    }, {
        criterionId: string;
        passed: boolean;
        notes?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    id: string;
    timestamp: string;
    verdict: "complete" | "incomplete" | "blocked" | "error";
    fingerprintBefore?: string | undefined;
    fingerprintAfter?: string | undefined;
    criteriaEvaluated?: {
        criterionId: string;
        passed: boolean;
        notes?: string | undefined;
    }[] | undefined;
}, {
    reason: string;
    id: string;
    timestamp: string;
    verdict: "complete" | "incomplete" | "blocked" | "error";
    fingerprintBefore?: string | undefined;
    fingerprintAfter?: string | undefined;
    criteriaEvaluated?: {
        criterionId: string;
        passed: boolean;
        notes?: string | undefined;
    }[] | undefined;
}>;
export type StopAttempt = z.infer<typeof StopAttemptSchema>;
/**
 * Git baseline information captured at session start
 */
export declare const GitBaselineSchema: z.ZodObject<{
    branch: z.ZodString;
    commitHash: z.ZodString;
    isDirty: z.ZodBoolean;
    capturedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    branch: string;
    commitHash: string;
    isDirty: boolean;
    capturedAt: string;
}, {
    branch: string;
    commitHash: string;
    isDirty: boolean;
    capturedAt: string;
}>;
export type GitBaseline = z.infer<typeof GitBaselineSchema>;
/**
 * Workspace fingerprint - hash of relevant file states
 */
export declare const WorkspaceFingerprintSchema: z.ZodObject<{
    hash: z.ZodString;
    timestamp: z.ZodString;
    afterCommand: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timestamp: string;
    hash: string;
    afterCommand?: string | undefined;
}, {
    timestamp: string;
    hash: string;
    afterCommand?: string | undefined;
}>;
export type WorkspaceFingerprint = z.infer<typeof WorkspaceFingerprintSchema>;
/**
 * The main Task Ledger structure - persisted state for RealityCheck
 */
export declare const TaskLedgerSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    sessionId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    directives: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        rawText: z.ZodString;
        normalizedIntent: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["initial", "followup", "clarification"]>;
        status: z.ZodEnum<["active", "superseded", "completed", "abandoned"]>;
        createdAt: z.ZodString;
        completedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "initial" | "followup" | "clarification";
        status: "active" | "superseded" | "completed" | "abandoned";
        id: string;
        rawText: string;
        createdAt: string;
        normalizedIntent?: string | undefined;
        completedAt?: string | undefined;
    }, {
        type: "initial" | "followup" | "clarification";
        status: "active" | "superseded" | "completed" | "abandoned";
        id: string;
        rawText: string;
        createdAt: string;
        normalizedIntent?: string | undefined;
        completedAt?: string | undefined;
    }>, "many">;
    criteria: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        directiveId: z.ZodString;
        description: z.ZodString;
        verified: z.ZodDefault<z.ZodBoolean>;
        verifiedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        directiveId: string;
        description: string;
        verified: boolean;
        verifiedAt?: string | undefined;
    }, {
        id: string;
        directiveId: string;
        description: string;
        verified?: boolean | undefined;
        verifiedAt?: string | undefined;
    }>, "many">;
    stopAttempts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodString;
        verdict: z.ZodEnum<["complete", "incomplete", "blocked", "error"]>;
        reason: z.ZodString;
        fingerprintBefore: z.ZodOptional<z.ZodString>;
        fingerprintAfter: z.ZodOptional<z.ZodString>;
        criteriaEvaluated: z.ZodOptional<z.ZodArray<z.ZodObject<{
            criterionId: z.ZodString;
            passed: z.ZodBoolean;
            notes: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }, {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        id: string;
        timestamp: string;
        verdict: "complete" | "incomplete" | "blocked" | "error";
        fingerprintBefore?: string | undefined;
        fingerprintAfter?: string | undefined;
        criteriaEvaluated?: {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }[] | undefined;
    }, {
        reason: string;
        id: string;
        timestamp: string;
        verdict: "complete" | "incomplete" | "blocked" | "error";
        fingerprintBefore?: string | undefined;
        fingerprintAfter?: string | undefined;
        criteriaEvaluated?: {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }[] | undefined;
    }>, "many">;
    gitBaseline: z.ZodOptional<z.ZodObject<{
        branch: z.ZodString;
        commitHash: z.ZodString;
        isDirty: z.ZodBoolean;
        capturedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        branch: string;
        commitHash: string;
        isDirty: boolean;
        capturedAt: string;
    }, {
        branch: string;
        commitHash: string;
        isDirty: boolean;
        capturedAt: string;
    }>>;
    fingerprints: z.ZodArray<z.ZodObject<{
        hash: z.ZodString;
        timestamp: z.ZodString;
        afterCommand: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timestamp: string;
        hash: string;
        afterCommand?: string | undefined;
    }, {
        timestamp: string;
        hash: string;
        afterCommand?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    createdAt: string;
    version: 1;
    sessionId: string;
    updatedAt: string;
    directives: {
        type: "initial" | "followup" | "clarification";
        status: "active" | "superseded" | "completed" | "abandoned";
        id: string;
        rawText: string;
        createdAt: string;
        normalizedIntent?: string | undefined;
        completedAt?: string | undefined;
    }[];
    criteria: {
        id: string;
        directiveId: string;
        description: string;
        verified: boolean;
        verifiedAt?: string | undefined;
    }[];
    stopAttempts: {
        reason: string;
        id: string;
        timestamp: string;
        verdict: "complete" | "incomplete" | "blocked" | "error";
        fingerprintBefore?: string | undefined;
        fingerprintAfter?: string | undefined;
        criteriaEvaluated?: {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }[] | undefined;
    }[];
    fingerprints: {
        timestamp: string;
        hash: string;
        afterCommand?: string | undefined;
    }[];
    gitBaseline?: {
        branch: string;
        commitHash: string;
        isDirty: boolean;
        capturedAt: string;
    } | undefined;
}, {
    createdAt: string;
    version: 1;
    sessionId: string;
    updatedAt: string;
    directives: {
        type: "initial" | "followup" | "clarification";
        status: "active" | "superseded" | "completed" | "abandoned";
        id: string;
        rawText: string;
        createdAt: string;
        normalizedIntent?: string | undefined;
        completedAt?: string | undefined;
    }[];
    criteria: {
        id: string;
        directiveId: string;
        description: string;
        verified?: boolean | undefined;
        verifiedAt?: string | undefined;
    }[];
    stopAttempts: {
        reason: string;
        id: string;
        timestamp: string;
        verdict: "complete" | "incomplete" | "blocked" | "error";
        fingerprintBefore?: string | undefined;
        fingerprintAfter?: string | undefined;
        criteriaEvaluated?: {
            criterionId: string;
            passed: boolean;
            notes?: string | undefined;
        }[] | undefined;
    }[];
    fingerprints: {
        timestamp: string;
        hash: string;
        afterCommand?: string | undefined;
    }[];
    gitBaseline?: {
        branch: string;
        commitHash: string;
        isDirty: boolean;
        capturedAt: string;
    } | undefined;
}>;
export type TaskLedger = z.infer<typeof TaskLedgerSchema>;
/**
 * Trend analysis result for stop attempts
 */
export declare const ProgressTrendSchema: z.ZodEnum<["improving", "stagnant", "regressing"]>;
export type ProgressTrend = z.infer<typeof ProgressTrendSchema>;
/**
 * Result of progress analysis
 */
export declare const ProgressAnalysisSchema: z.ZodObject<{
    trend: z.ZodEnum<["improving", "stagnant", "regressing"]>;
    consecutiveFailures: z.ZodNumber;
    totalAttempts: z.ZodNumber;
    uniqueFingerprints: z.ZodNumber;
    recommendation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    trend: "improving" | "stagnant" | "regressing";
    consecutiveFailures: number;
    totalAttempts: number;
    uniqueFingerprints: number;
    recommendation?: string | undefined;
}, {
    trend: "improving" | "stagnant" | "regressing";
    consecutiveFailures: number;
    totalAttempts: number;
    uniqueFingerprints: number;
    recommendation?: string | undefined;
}>;
export type ProgressAnalysis = z.infer<typeof ProgressAnalysisSchema>;
/**
 * Limit check result
 */
export declare const LimitCheckResultSchema: z.ZodObject<{
    exceeded: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
    consecutiveFailures: z.ZodNumber;
    totalAttempts: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    consecutiveFailures: number;
    totalAttempts: number;
    exceeded: boolean;
    reason?: string | undefined;
}, {
    consecutiveFailures: number;
    totalAttempts: number;
    exceeded: boolean;
    reason?: string | undefined;
}>;
export type LimitCheckResult = z.infer<typeof LimitCheckResultSchema>;
//# sourceMappingURL=index.d.ts.map
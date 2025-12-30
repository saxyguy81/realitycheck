import { z } from 'zod';

// =============================================================================
// Hook Input Schemas
// =============================================================================

/**
 * Base schema for all hook inputs - common fields across all hook types
 */
export const BaseHookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
});

export type BaseHookInput = z.infer<typeof BaseHookInputSchema>;

/**
 * UserPromptSubmit hook - fired when user submits a new prompt
 */
export const UserPromptSubmitInputSchema = BaseHookInputSchema.extend({
  hook_type: z.literal('UserPromptSubmit'),
  prompt: z.string(),
});

export type UserPromptSubmitInput = z.infer<typeof UserPromptSubmitInputSchema>;

/**
 * Stop hook - fired when Claude attempts to stop/complete the task
 * Includes stop_hook_active to detect recursion (judge calling stop)
 */
export const StopHookInputSchema = BaseHookInputSchema.extend({
  hook_type: z.literal('Stop'),
  stop_hook_active: z.boolean().default(false),
});

export type StopHookInput = z.infer<typeof StopHookInputSchema>;

/**
 * PostToolUse hook - fired after a tool is executed
 */
export const PostToolUseInputSchema = BaseHookInputSchema.extend({
  hook_type: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_output: z.unknown().optional(),
});

export type PostToolUseInput = z.infer<typeof PostToolUseInputSchema>;

/**
 * SessionStart hook - fired when a new Claude Code session begins
 */
export const SessionStartInputSchema = BaseHookInputSchema.extend({
  hook_type: z.literal('SessionStart'),
});

export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

/**
 * Union of all hook input types
 */
export const HookInputSchema = z.discriminatedUnion('hook_type', [
  UserPromptSubmitInputSchema,
  StopHookInputSchema,
  PostToolUseInputSchema,
  SessionStartInputSchema,
]);

export type HookInput = z.infer<typeof HookInputSchema>;

// =============================================================================
// Hook Output Schemas
// =============================================================================

/**
 * Decision schema for hook responses
 * - continue: Allow the action to proceed
 * - block: Prevent the action with a message
 */
export const HookDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('continue'),
  }),
  z.object({
    decision: z.literal('block'),
    reason: z.string(),
  }),
]);

export type HookDecision = z.infer<typeof HookDecisionSchema>;

// =============================================================================
// Task Ledger Schemas
// =============================================================================

/**
 * Status of a user directive/task
 */
export const DirectiveStatusSchema = z.enum([
  'active',      // Currently being worked on
  'superseded',  // Replaced by a newer directive
  'completed',   // Successfully finished
  'abandoned',   // User gave up or changed direction
]);

export type DirectiveStatus = z.infer<typeof DirectiveStatusSchema>;

/**
 * Type of directive - how it was captured
 */
export const DirectiveTypeSchema = z.enum([
  'initial',     // First prompt in session
  'followup',    // Subsequent user prompt
  'clarification', // Response to a question
]);

export type DirectiveType = z.infer<typeof DirectiveTypeSchema>;

/**
 * A user directive/task to be completed
 */
export const DirectiveSchema = z.object({
  id: z.string().uuid(),
  rawText: z.string(),
  normalizedIntent: z.string().optional(),
  type: DirectiveTypeSchema,
  status: DirectiveStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export type Directive = z.infer<typeof DirectiveSchema>;

/**
 * An acceptance criterion extracted from a directive
 */
export const AcceptanceCriterionSchema = z.object({
  id: z.string().uuid(),
  directiveId: z.string().uuid(),
  description: z.string(),
  verified: z.boolean().default(false),
  verifiedAt: z.string().datetime().optional(),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/**
 * Verdict from the judge on a stop attempt
 */
export const JudgeVerdictSchema = z.enum([
  'complete',    // Task is fully done
  'incomplete',  // Task needs more work
  'blocked',     // Task cannot proceed (needs user input)
  'error',       // Judge encountered an error
]);

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/**
 * Record of a stop attempt and judge evaluation
 */
export const StopAttemptSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  verdict: JudgeVerdictSchema,
  reason: z.string(),
  fingerprintBefore: z.string().optional(),
  fingerprintAfter: z.string().optional(),
  criteriaEvaluated: z.array(z.object({
    criterionId: z.string().uuid(),
    passed: z.boolean(),
    notes: z.string().optional(),
  })).optional(),
});

export type StopAttempt = z.infer<typeof StopAttemptSchema>;

/**
 * Git baseline information captured at session start
 */
export const GitBaselineSchema = z.object({
  branch: z.string(),
  commitHash: z.string(),
  isDirty: z.boolean(),
  capturedAt: z.string().datetime(),
});

export type GitBaseline = z.infer<typeof GitBaselineSchema>;

/**
 * Workspace fingerprint - hash of relevant file states
 */
export const WorkspaceFingerprintSchema = z.object({
  hash: z.string(),
  timestamp: z.string().datetime(),
  afterCommand: z.string().optional(),
});

export type WorkspaceFingerprint = z.infer<typeof WorkspaceFingerprintSchema>;

/**
 * The main Task Ledger structure - persisted state for RealityCheck
 */
export const TaskLedgerSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  directives: z.array(DirectiveSchema),
  criteria: z.array(AcceptanceCriterionSchema),
  stopAttempts: z.array(StopAttemptSchema),
  gitBaseline: GitBaselineSchema.optional(),
  fingerprints: z.array(WorkspaceFingerprintSchema),
});

export type TaskLedger = z.infer<typeof TaskLedgerSchema>;

// =============================================================================
// Progress Analysis Types
// =============================================================================

/**
 * Trend analysis result for stop attempts
 */
export const ProgressTrendSchema = z.enum([
  'improving',   // Making progress toward completion
  'stagnant',    // No meaningful progress
  'regressing',  // Getting worse or going in circles
]);

export type ProgressTrend = z.infer<typeof ProgressTrendSchema>;

/**
 * Result of progress analysis
 */
export const ProgressAnalysisSchema = z.object({
  trend: ProgressTrendSchema,
  consecutiveFailures: z.number(),
  totalAttempts: z.number(),
  uniqueFingerprints: z.number(),
  recommendation: z.string().optional(),
});

export type ProgressAnalysis = z.infer<typeof ProgressAnalysisSchema>;

/**
 * Limit check result
 */
export const LimitCheckResultSchema = z.object({
  exceeded: z.boolean(),
  reason: z.string().optional(),
  consecutiveFailures: z.number(),
  totalAttempts: z.number(),
});

export type LimitCheckResult = z.infer<typeof LimitCheckResultSchema>;

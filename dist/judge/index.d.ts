import { z } from 'zod';
import { RealityCheckConfig } from '../config/index.js';
import { Directive, StopAttempt } from '../types/index.js';
import { GitDiff } from '../git/index.js';
/**
 * Schema for the judge's verdict on task completion
 * This is returned by the Claude subprocess in JSON format
 */
export declare const JudgeVerdictSchema: z.ZodObject<{
    pass: z.ZodBoolean;
    reason: z.ZodString;
    missingItems: z.ZodArray<z.ZodString, "many">;
    questionsForUser: z.ZodArray<z.ZodString, "many">;
    forwardProgress: z.ZodBoolean;
    convergenceEstimate: z.ZodOptional<z.ZodNumber>;
    suggestedNextSteps: z.ZodArray<z.ZodString, "many">;
    unnecessaryQuestion: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    autonomyInstructionDetected: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    pass: boolean;
    missingItems: string[];
    questionsForUser: string[];
    forwardProgress: boolean;
    suggestedNextSteps: string[];
    unnecessaryQuestion: boolean;
    autonomyInstructionDetected: boolean;
    convergenceEstimate?: number | undefined;
}, {
    reason: string;
    pass: boolean;
    missingItems: string[];
    questionsForUser: string[];
    forwardProgress: boolean;
    suggestedNextSteps: string[];
    convergenceEstimate?: number | undefined;
    unnecessaryQuestion?: boolean | undefined;
    autonomyInstructionDetected?: boolean | undefined;
}>;
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
export interface JudgeInput {
    config: RealityCheckConfig;
    directives: Directive[];
    diff: GitDiff | null;
    fingerprint: string;
    lastMessage?: string;
    stopAttempts: StopAttempt[];
    projectDir: string;
}
/**
 * Build the evaluation prompt for the judge
 * Contains all context needed to evaluate task completion
 */
export declare function buildJudgePrompt(directives: Directive[], diff: GitDiff | null, lastMessage: string | undefined, stopAttempts: StopAttempt[], fingerprint: string): string;
/**
 * Run the external judge to evaluate task completion
 *
 * @param input - All context needed for evaluation
 * @returns The judge's verdict
 */
export declare function runJudge(input: JudgeInput): Promise<JudgeVerdict>;
//# sourceMappingURL=index.d.ts.map
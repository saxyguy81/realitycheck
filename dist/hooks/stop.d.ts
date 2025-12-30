import { HookDecision } from '../types/index.js';
/**
 * Handle the Stop hook - the main quality gate
 *
 * This hook is called when Claude attempts to complete/stop a task.
 * It evaluates whether all user requirements have been met and can
 * block the stop if the task is incomplete.
 *
 * @param rawInput - The raw hook input from Claude Code
 * @returns HookDecision to approve or block the stop
 */
export declare function handleStop(rawInput: unknown): Promise<HookDecision | undefined>;
//# sourceMappingURL=stop.d.ts.map
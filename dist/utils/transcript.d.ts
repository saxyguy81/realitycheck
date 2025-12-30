/**
 * A single message from the Claude Code transcript
 */
export interface TranscriptMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    toolUse?: {
        name: string;
        input: unknown;
    };
}
/**
 * Read and parse a Claude Code transcript file
 *
 * The transcript is stored as JSONL (JSON Lines) format where each line
 * is a separate JSON object representing a message or event.
 *
 * @param transcriptPath - Path to the transcript JSONL file
 * @param options - Optional parameters
 * @param options.lastN - Return only the last N messages
 * @returns Array of parsed transcript messages
 */
export declare function readTranscript(transcriptPath: string, options?: {
    lastN?: number;
}): Promise<TranscriptMessage[]>;
/**
 * Format transcript messages as a human-readable string
 * Useful for passing to the judge for context
 *
 * @param messages - Array of transcript messages
 * @returns Formatted string representation
 */
export declare function formatTranscript(messages: TranscriptMessage[]): string;
//# sourceMappingURL=transcript.d.ts.map
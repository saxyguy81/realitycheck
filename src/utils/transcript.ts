import { readFileSync, existsSync } from 'node:fs';

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
 * Content block types that can appear in transcript messages
 */
interface TextContentBlock {
  type: 'text';
  text: string;
}

interface ToolUseContentBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

type ContentBlock = TextContentBlock | ToolUseContentBlock | { type: string };

/**
 * Raw transcript entry structure (as stored in JSONL)
 */
interface RawTranscriptEntry {
  message?: {
    role?: 'user' | 'assistant' | 'system';
    content?: string | ContentBlock[];
  };
  timestamp?: string;
  type?: string;
}

/**
 * Extract text content from a content block or array of content blocks
 */
function extractTextContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block): block is TextContentBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Extract tool use information from content blocks
 */
function extractToolUse(content: string | ContentBlock[] | undefined): TranscriptMessage['toolUse'] | undefined {
  if (!content || typeof content === 'string' || !Array.isArray(content)) {
    return undefined;
  }

  const toolUseBlock = content.find(
    (block): block is ToolUseContentBlock => block.type === 'tool_use'
  );

  if (toolUseBlock) {
    return {
      name: toolUseBlock.name,
      input: toolUseBlock.input,
    };
  }

  return undefined;
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
export async function readTranscript(
  transcriptPath: string,
  options?: { lastN?: number },
): Promise<TranscriptMessage[]> {
  if (!existsSync(transcriptPath)) {
    return [];
  }

  const fileContent = readFileSync(transcriptPath, 'utf-8');
  const lines = fileContent.split('\n').filter((line) => line.trim());

  const messages: TranscriptMessage[] = [];

  for (const line of lines) {
    try {
      const entry: RawTranscriptEntry = JSON.parse(line);

      // Skip entries without a message
      if (!entry.message) continue;

      const { message, timestamp } = entry;
      const role = message.role;

      // Skip entries without a valid role
      if (!role || !['user', 'assistant', 'system'].includes(role)) continue;

      const textContent = extractTextContent(message.content);
      const toolUse = extractToolUse(message.content);

      messages.push({
        role,
        content: textContent,
        timestamp,
        toolUse,
      });
    } catch {
      // Skip malformed JSON lines
      continue;
    }
  }

  // Return last N messages if specified
  if (options?.lastN && options.lastN > 0) {
    return messages.slice(-options.lastN);
  }

  return messages;
}

/**
 * Format transcript messages as a human-readable string
 * Useful for passing to the judge for context
 *
 * @param messages - Array of transcript messages
 * @returns Formatted string representation
 */
export function formatTranscript(messages: TranscriptMessage[]): string {
  return messages
    .map((msg) => {
      const roleLabel = msg.role.toUpperCase();
      let text = `[${roleLabel}]: ${msg.content}`;

      if (msg.toolUse) {
        text += `\n  [Tool: ${msg.toolUse.name}]`;
      }

      return text;
    })
    .join('\n\n');
}

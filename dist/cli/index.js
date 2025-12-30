#!/usr/bin/env node
import { handleUserPromptSubmit } from '../hooks/userPromptSubmit.js';
import { handlePostToolUse } from '../hooks/postToolUse.js';
import { handleStop } from '../hooks/stop.js';
import { handleSessionStart } from '../hooks/sessionStart.js';
async function main() {
    // Read JSON from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    const hookEvent = input.hook_event_name;
    try {
        let result;
        switch (hookEvent) {
            case 'UserPromptSubmit':
                result = await handleUserPromptSubmit(input);
                break;
            case 'PostToolUse':
                result = await handlePostToolUse(input);
                break;
            case 'Stop':
                result = await handleStop(input);
                break;
            case 'SessionStart':
                result = await handleSessionStart(input);
                break;
            default:
                process.exit(0);
        }
        if (result) {
            console.log(JSON.stringify(result));
        }
        process.exit(0);
    }
    catch (error) {
        console.error(`RealityCheck hook error: ${error}`);
        process.exit(0); // Fail open
    }
}
main();
//# sourceMappingURL=index.js.map
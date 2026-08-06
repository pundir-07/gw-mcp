import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function jsonResult(data: unknown, isError = false): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        isError,
    };
}

export function errorResult(message: string, detail?: unknown): CallToolResult {
    return jsonResult({ error: message, detail }, true);
}

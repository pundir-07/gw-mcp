import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";

const documentId = z.string().describe("Google Docs document ID");

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("get"),
        documentId,
    }),

    z.object({
        action: z.literal("get_text"),
        documentId,
    }),

    z.object({
        action: z.literal("create"),
        title: z.string().describe("Document title"),
        folderId: z.string().optional().describe("Drive folder ID to create in"),
    }),

    z.object({
        action: z.literal("insert_text"),
        documentId,
        text: z.string().describe("Text to insert"),
        index: z.number().optional().describe("Character index to insert at (1-based). Omit to append at end."),
    }),

    z.object({
        action: z.literal("replace_text"),
        documentId,
        find: z.string().describe("Text to find"),
        replace: z.string().describe("Replacement text"),
        matchCase: z.boolean().optional().default(true).describe("Case-sensitive match"),
    }),

    z.object({
        action: z.literal("batch_update"),
        documentId,
        requests: z.array(z.record(z.string(), z.unknown())).describe("Array of Docs API batchUpdate request objects"),
    }),
]);

// recursively extract plain text from a Docs document body
function extractText(body: Record<string, unknown>): string {
    const content = body.content as Array<Record<string, unknown>> | undefined;
    if (!content) return "";

    const parts: string[] = [];
    for (const element of content) {
        if (element.paragraph) {
            const para = element.paragraph as Record<string, unknown>;
            const elements = para.elements as Array<Record<string, unknown>> | undefined;
            if (elements) {
                for (const el of elements) {
                    const textRun = el.textRun as Record<string, unknown> | undefined;
                    if (textRun?.content) {
                        parts.push(textRun.content as string);
                    }
                }
            }
        } else if (element.table) {
            const table = element.table as Record<string, unknown>;
            const rows = table.tableRows as Array<Record<string, unknown>> | undefined;
            if (rows) {
                for (const row of rows) {
                    const cells = row.tableCells as Array<Record<string, unknown>> | undefined;
                    if (cells) {
                        for (const cell of cells) {
                            parts.push(extractText(cell));
                        }
                    }
                }
            }
        }
    }
    return parts.join("");
}

export function registerDocsTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_docs",
        {
            title: "Google Docs",
            description: "Read, create, and edit Google Docs. Insert text, find/replace, or send raw batchUpdate requests. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args) => {
            const docs = auth.getDocs();

            try {
                switch (args.action) {
                    case "get": {
                        const res = await docs.documents.get({
                            documentId: args.documentId,
                        });
                        return jsonResult(res.data);
                    }

                    case "get_text": {
                        const res = await docs.documents.get({
                            documentId: args.documentId,
                        });
                        const text = extractText(
                            res.data.body as Record<string, unknown>
                        );
                        return jsonResult({
                            documentId: res.data.documentId,
                            title: res.data.title,
                            text,
                        });
                    }

                    case "create": {
                        // create via Drive so we can set the folder
                        if (args.folderId) {
                            const drive = auth.getDrive();
                            const res = await drive.files.create({
                                requestBody: {
                                    name: args.title,
                                    mimeType: "application/vnd.google-apps.document",
                                    parents: [args.folderId],
                                },
                                fields: "id,name,webViewLink",
                            });
                            return jsonResult(res.data);
                        }

                        const res = await docs.documents.create({
                            requestBody: { title: args.title },
                        });
                        return jsonResult({
                            documentId: res.data.documentId,
                            title: res.data.title,
                        });
                    }

                    case "insert_text": {
                        if (args.index) {
                            // insert at specified position
                            await docs.documents.batchUpdate({
                                documentId: args.documentId,
                                requestBody: {
                                    requests: [{
                                        insertText: {
                                            location: { index: args.index },
                                            text: args.text,
                                        },
                                    }],
                                },
                            });
                        } else {
                            // append at end — get doc length first
                            const doc = await docs.documents.get({
                                documentId: args.documentId,
                            });
                            const body = doc.data.body as Record<string, unknown>;
                            const content = body.content as Array<Record<string, unknown>>;
                            const lastElement = content[content.length - 1];
                            const endIndex = (lastElement?.endIndex as number ?? 2) - 1;

                            await docs.documents.batchUpdate({
                                documentId: args.documentId,
                                requestBody: {
                                    requests: [{
                                        insertText: {
                                            location: { index: Math.max(1, endIndex) },
                                            text: args.text,
                                        },
                                    }],
                                },
                            });
                        }
                        return jsonResult({ success: true, documentId: args.documentId });
                    }

                    case "replace_text": {
                        const res = await docs.documents.batchUpdate({
                            documentId: args.documentId,
                            requestBody: {
                                requests: [{
                                    replaceAllText: {
                                        containsText: {
                                            text: args.find,
                                            matchCase: args.matchCase,
                                        },
                                        replaceText: args.replace,
                                    },
                                }],
                            },
                        });

                        const replies = res.data.replies ?? [];
                        const occurrences = (replies[0] as Record<string, unknown>)
                            ?.replaceAllText as Record<string, unknown> | undefined;

                        return jsonResult({
                            documentId: args.documentId,
                            occurrencesReplaced: occurrences?.occurrencesChanged ?? 0,
                        });
                    }

                    case "batch_update": {
                        const res = await docs.documents.batchUpdate({
                            documentId: args.documentId,
                            requestBody: { requests: args.requests },
                        });
                        return jsonResult(res.data);
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Docs ${args.action} failed`, message);
            }
        }
    );
}

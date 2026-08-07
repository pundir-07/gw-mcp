import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";
import { resolveGmail } from "../lib/resolveAuth.ts";

const messageId = z.string().describe("Gmail message ID");
const maxResults = z.number().optional().default(10).describe("Max results");

// Build a raw RFC 2822 email string
function buildRawEmail(opts: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
}): string {
    const lines = [
        `To: ${opts.to}`,
        `Subject: ${opts.subject}`,
        `Content-Type: text/html; charset=utf-8`,
    ];
    if (opts.cc) lines.push(`Cc: ${opts.cc}`);
    if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
    if (opts.inReplyTo) {
        lines.push(`In-Reply-To: ${opts.inReplyTo}`);
        lines.push(`References: ${opts.references ?? opts.inReplyTo}`);
    }
    lines.push("", opts.body);
    return Buffer.from(lines.join("\r\n")).toString("base64url");
}

// Extract readable parts from a Gmail message payload
function extractBody(payload: Record<string, unknown>): string {
    // simple single-part
    if (payload.body && (payload.body as Record<string, unknown>).data) {
        return Buffer.from(
            (payload.body as Record<string, string>).data!,
            "base64url"
        ).toString("utf-8");
    }

    // multipart — walk parts looking for text
    const parts = (payload.parts as Record<string, unknown>[] | undefined) ?? [];
    for (const part of parts) {
        const mime = part.mimeType as string;
        if (mime === "text/plain" || mime === "text/html") {
            const data = ((part.body as Record<string, unknown>)?.data as string) ?? "";
            if (data) return Buffer.from(data, "base64url").toString("utf-8");
        }
        // nested multipart
        if (mime?.startsWith("multipart/")) {
            const nested = extractBody(part);
            if (nested) return nested;
        }
    }
    return "";
}

// Pull headers into a flat object
function extractHeaders(
    headers: Array<{ name: string; value: string }> | undefined
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of headers ?? []) {
        result[h.name.toLowerCase()] = h.value;
    }
    return result;
}

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("search"),
        query: z.string().optional().default("").describe("Gmail search query (e.g. 'is:unread', 'from:alice@example.com', 'has:attachment newer_than:2d')"),
        maxResults,
        labelIds: z.array(z.string()).optional().describe("Filter by label IDs, e.g. ['INBOX', 'UNREAD']"),
    }),

    z.object({
        action: z.literal("get"),
        messageId,
        format: z.enum(["full", "metadata", "minimal"]).optional().default("full").describe("Response detail level"),
    }),

    z.object({
        action: z.literal("send"),
        to: z.string().describe("Recipient email(s), comma-separated"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (HTML supported)"),
        cc: z.string().optional().describe("CC recipients, comma-separated"),
        bcc: z.string().optional().describe("BCC recipients, comma-separated"),
    }),

    z.object({
        action: z.literal("reply"),
        messageId: messageId.describe("Message ID to reply to"),
        body: z.string().describe("Reply body (HTML supported)"),
    }),

    z.object({
        action: z.literal("modify_labels"),
        messageId,
        addLabels: z.array(z.string()).optional().describe("Label IDs to add (e.g. ['STARRED', 'IMPORTANT'])"),
        removeLabels: z.array(z.string()).optional().describe("Label IDs to remove (e.g. ['UNREAD', 'INBOX'] to archive+mark-read)"),
    }),

    z.object({
        action: z.literal("list_labels"),
    }),

    z.object({
        action: z.literal("trash"),
        messageId,
    }),

    z.object({
        action: z.literal("create_draft"),
        to: z.string().describe("Recipient email(s)"),
        subject: z.string().describe("Subject line"),
        body: z.string().describe("Body content"),
        cc: z.string().optional(),
        bcc: z.string().optional(),
    }),
]);

export function registerGmailTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_gmail",
        {
            title: "Google Gmail",
            description: "Search, read, send, reply, label, draft, and trash emails. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args, extra) => {
            const gmail = resolveGmail(auth, extra);
            const userId = "me";

            try {
                switch (args.action) {
                    case "search": {
                        const res = await gmail.users.messages.list({
                            userId,
                            q: args.query || undefined,
                            maxResults: args.maxResults,
                            labelIds: args.labelIds,
                        });

                        const messages = res.data.messages ?? [];
                        if (messages.length === 0) return jsonResult([]);

                        // fetch summaries for each message
                        const summaries = await Promise.all(
                            messages.map(async (m) => {
                                const full = await gmail.users.messages.get({
                                    userId,
                                    id: m.id!,
                                    format: "metadata",
                                    metadataHeaders: ["From", "To", "Subject", "Date"],
                                });
                                const headers = extractHeaders(
                                    full.data.payload?.headers as Array<{ name: string; value: string }> | undefined
                                );
                                return {
                                    id: m.id,
                                    threadId: m.threadId,
                                    snippet: full.data.snippet,
                                    from: headers.from,
                                    to: headers.to,
                                    subject: headers.subject,
                                    date: headers.date,
                                    labelIds: full.data.labelIds,
                                };
                            })
                        );
                        return jsonResult(summaries);
                    }

                    case "get": {
                        const res = await gmail.users.messages.get({
                            userId,
                            id: args.messageId,
                            format: args.format,
                        });

                        const headers = extractHeaders(
                            res.data.payload?.headers as Array<{ name: string; value: string }> | undefined
                        );
                        const body = args.format === "full"
                            ? extractBody(res.data.payload as Record<string, unknown>)
                            : undefined;

                        return jsonResult({
                            id: res.data.id,
                            threadId: res.data.threadId,
                            labelIds: res.data.labelIds,
                            snippet: res.data.snippet,
                            headers,
                            body,
                        });
                    }

                    case "send": {
                        const raw = buildRawEmail({
                            to: args.to,
                            subject: args.subject,
                            body: args.body,
                            cc: args.cc,
                            bcc: args.bcc,
                        });
                        const res = await gmail.users.messages.send({
                            userId,
                            requestBody: { raw },
                        });
                        return jsonResult({ sent: true, id: res.data.id, threadId: res.data.threadId });
                    }

                    case "reply": {
                        // fetch original to get thread context
                        const original = await gmail.users.messages.get({
                            userId,
                            id: args.messageId,
                            format: "metadata",
                            metadataHeaders: ["From", "Subject", "Message-ID"],
                        });
                        const headers = extractHeaders(
                            original.data.payload?.headers as Array<{ name: string; value: string }> | undefined
                        );

                        const raw = buildRawEmail({
                            to: headers.from ?? "",
                            subject: headers.subject?.startsWith("Re:") ? headers.subject : `Re: ${headers.subject ?? ""}`,
                            body: args.body,
                            inReplyTo: headers["message-id"],
                        });

                        const res = await gmail.users.messages.send({
                            userId,
                            requestBody: {
                                raw,
                                threadId: original.data.threadId!,
                            },
                        });
                        return jsonResult({ replied: true, id: res.data.id, threadId: res.data.threadId });
                    }

                    case "modify_labels": {
                        const res = await gmail.users.messages.modify({
                            userId,
                            id: args.messageId,
                            requestBody: {
                                addLabelIds: args.addLabels,
                                removeLabelIds: args.removeLabels,
                            },
                        });
                        return jsonResult({ id: res.data.id, labelIds: res.data.labelIds });
                    }

                    case "list_labels": {
                        const res = await gmail.users.labels.list({ userId });
                        return jsonResult(res.data.labels ?? []);
                    }

                    case "trash": {
                        await gmail.users.messages.trash({ userId, id: args.messageId });
                        return jsonResult({ trashed: args.messageId });
                    }

                    case "create_draft": {
                        const raw = buildRawEmail({
                            to: args.to,
                            subject: args.subject,
                            body: args.body,
                            cc: args.cc,
                            bcc: args.bcc,
                        });
                        const res = await gmail.users.drafts.create({
                            userId,
                            requestBody: {
                                message: { raw },
                            },
                        });
                        return jsonResult({ draftId: res.data.id, messageId: res.data.message?.id });
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Gmail ${args.action} failed`, message);
            }
        }
    );
}

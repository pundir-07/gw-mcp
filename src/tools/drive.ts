import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";
import { resolveDrive } from "../lib/resolveAuth.ts";

// common fields reused across actions
const fileId = z.string().describe("Google Drive file ID");
const maxResults = z.number().optional().default(20).describe("Max results to return");

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("search"),
        query: z.string().optional().describe("Full-text search query or filename"),
        mimeType: z.string().optional().describe("Filter by MIME type, e.g. application/pdf, application/vnd.google-apps.folder"),
        folderId: z.string().optional().describe("Restrict search to this folder ID"),
        trashed: z.boolean().optional().default(false).describe("Include trashed files"),
        maxResults,
    }),

    z.object({
        action: z.literal("get"),
        fileId,
        fields: z.string().optional().describe("Comma-separated fields to return (default: id,name,mimeType,size,modifiedTime,webViewLink,parents)"),
    }),

    z.object({
        action: z.literal("get_content"),
        fileId,
        exportMimeType: z.string().optional().describe("For Google Workspace files, export as this MIME type (e.g. text/plain, text/csv). Native files are downloaded directly."),
    }),

    z.object({
        action: z.literal("create"),
        name: z.string().describe("File name"),
        mimeType: z.string().optional().describe("MIME type. Use application/vnd.google-apps.folder for folders, application/vnd.google-apps.document for Docs, etc."),
        parentId: z.string().optional().describe("Parent folder ID"),
        content: z.string().optional().describe("Text content to upload (for non-Workspace files)"),
    }),

    z.object({
        action: z.literal("update"),
        fileId,
        name: z.string().optional().describe("New file name"),
        content: z.string().optional().describe("New text content"),
        addParents: z.string().optional().describe("Comma-separated folder IDs to add as parents (move into)"),
        removeParents: z.string().optional().describe("Comma-separated folder IDs to remove as parents (move out of)"),
    }),

    z.object({
        action: z.literal("delete"),
        fileId,
        permanent: z.boolean().optional().default(false).describe("Permanently delete instead of trashing"),
    }),

    z.object({
        action: z.literal("list_permissions"),
        fileId,
    }),

    z.object({
        action: z.literal("share"),
        fileId,
        email: z.string().describe("Email address to share with"),
        role: z.enum(["reader", "writer", "commenter", "owner"]).describe("Permission role"),
        notify: z.boolean().optional().default(true).describe("Send notification email"),
    }),
]);

export function registerDriveTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_drive",
        {
            title: "Google Drive",
            description: "Search, read, create, update, delete, and share files in Google Drive. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args, extra) => {
            const drive = resolveDrive(auth, extra);

            try {
                switch (args.action) {
                    case "search": {
                        const clauses: string[] = [];
                        if (args.query) clauses.push(`fullText contains '${args.query}' or name contains '${args.query}'`);
                        if (args.mimeType) clauses.push(`mimeType = '${args.mimeType}'`);
                        if (args.folderId) clauses.push(`'${args.folderId}' in parents`);
                        if (!args.trashed) clauses.push("trashed = false");

                        const q = clauses.join(" and ") || undefined;
                        const res = await drive.files.list({
                            q,
                            pageSize: args.maxResults,
                            fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
                            orderBy: "modifiedTime desc",
                        });
                        return jsonResult(res.data.files ?? []);
                    }

                    case "get": {
                        const fields = args.fields ?? "id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,description";
                        const res = await drive.files.get({ fileId: args.fileId, fields });
                        return jsonResult(res.data);
                    }

                    case "get_content": {
                        const meta = await drive.files.get({ fileId: args.fileId, fields: "mimeType" });
                        const mime = meta.data.mimeType ?? "";

                        // Google Workspace files need export
                        if (mime.startsWith("application/vnd.google-apps.")) {
                            const exportMime = args.exportMimeType ?? "text/plain";
                            const res = await drive.files.export(
                                { fileId: args.fileId, mimeType: exportMime },
                                { responseType: "text" }
                            );
                            return jsonResult({ content: res.data, exportedAs: exportMime });
                        }

                        // native files — download as text
                        const res = await drive.files.get(
                            { fileId: args.fileId, alt: "media" },
                            { responseType: "text" }
                        );
                        return jsonResult({ content: res.data });
                    }

                    case "create": {
                        const requestBody: Record<string, unknown> = { name: args.name };
                        if (args.mimeType) requestBody.mimeType = args.mimeType;
                        if (args.parentId) requestBody.parents = [args.parentId];

                        if (args.content) {
                            // upload with content
                            const res = await drive.files.create({
                                requestBody,
                                media: {
                                    mimeType: "text/plain",
                                    body: args.content,
                                },
                                fields: "id,name,mimeType,webViewLink",
                            });
                            return jsonResult(res.data);
                        }

                        const res = await drive.files.create({
                            requestBody,
                            fields: "id,name,mimeType,webViewLink",
                        });
                        return jsonResult(res.data);
                    }

                    case "update": {
                        const requestBody: Record<string, unknown> = {};
                        if (args.name) requestBody.name = args.name;

                        const params: Record<string, unknown> = {
                            fileId: args.fileId,
                            requestBody,
                            fields: "id,name,mimeType,webViewLink",
                        };
                        if (args.addParents) params.addParents = args.addParents;
                        if (args.removeParents) params.removeParents = args.removeParents;

                        if (args.content) {
                            (params as Record<string, unknown>).media = {
                                mimeType: "text/plain",
                                body: args.content,
                            };
                        }

                        const res = await drive.files.update(params);
                        return jsonResult(res.data);
                    }

                    case "delete": {
                        if (args.permanent) {
                            await drive.files.delete({ fileId: args.fileId });
                            return jsonResult({ deleted: args.fileId });
                        }
                        // trash
                        const res = await drive.files.update({
                            fileId: args.fileId,
                            requestBody: { trashed: true },
                            fields: "id,name,trashed",
                        });
                        return jsonResult(res.data);
                    }

                    case "list_permissions": {
                        const res = await drive.permissions.list({
                            fileId: args.fileId,
                            fields: "permissions(id,emailAddress,role,type,displayName)",
                        });
                        return jsonResult(res.data.permissions ?? []);
                    }

                    case "share": {
                        const res = await drive.permissions.create({
                            fileId: args.fileId,
                            sendNotificationEmail: args.notify,
                            requestBody: {
                                type: "user",
                                role: args.role,
                                emailAddress: args.email,
                            },
                            fields: "id,emailAddress,role",
                        });
                        return jsonResult(res.data);
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Drive ${args.action} failed`, message);
            }
        }
    );
}

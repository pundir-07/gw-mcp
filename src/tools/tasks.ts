import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";
import { resolveTasks } from "../lib/resolveAuth.ts";

const taskListId = z.string().optional().default("@default").describe("Task list ID (default: user's primary list)");
const requiredTaskListId = z.string().describe("Task list ID");
const taskId = z.string().describe("Task ID");

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("list_tasklists"),
    }),

    z.object({
        action: z.literal("list_tasks"),
        taskListId,
        showCompleted: z.boolean().optional().default(true).describe("Include completed tasks"),
        showHidden: z.boolean().optional().default(false).describe("Include hidden/deleted tasks"),
        dueMin: z.string().optional().describe("Lower bound for due date (ISO 8601)"),
        dueMax: z.string().optional().describe("Upper bound for due date (ISO 8601)"),
        maxResults: z.number().optional().default(50).describe("Max tasks to return"),
    }),

    z.object({
        action: z.literal("get_task"),
        taskListId: requiredTaskListId,
        taskId,
    }),

    z.object({
        action: z.literal("create_task"),
        taskListId,
        title: z.string().describe("Task title"),
        notes: z.string().optional().describe("Task notes/description"),
        due: z.string().optional().describe("Due date (ISO 8601 or YYYY-MM-DD)"),
        parent: z.string().optional().describe("Parent task ID to create as subtask"),
    }),

    z.object({
        action: z.literal("update_task"),
        taskListId: requiredTaskListId,
        taskId,
        title: z.string().optional(),
        notes: z.string().optional(),
        due: z.string().optional().describe("Due date (ISO 8601 or YYYY-MM-DD)"),
        status: z.enum(["needsAction", "completed"]).optional().describe("Task status"),
    }),

    z.object({
        action: z.literal("delete_task"),
        taskListId: requiredTaskListId,
        taskId,
    }),

    z.object({
        action: z.literal("complete_task"),
        taskListId: requiredTaskListId,
        taskId,
    }),

    z.object({
        action: z.literal("move_task"),
        taskListId: requiredTaskListId,
        taskId,
        parent: z.string().optional().describe("New parent task ID (omit to move to top level)"),
        previous: z.string().optional().describe("Task ID to place after (for ordering)"),
    }),
]);

export function registerTasksTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_tasks",
        {
            title: "Google Tasks",
            description: "Manage task lists and tasks — create, update, complete, delete, reorder. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args, extra) => {
            const tasks = resolveTasks(auth, extra);

            try {
                switch (args.action) {
                    case "list_tasklists": {
                        const res = await tasks.tasklists.list();
                        const lists = (res.data.items ?? []).map((tl) => ({
                            id: tl.id,
                            title: tl.title,
                            updated: tl.updated,
                        }));
                        return jsonResult(lists);
                    }

                    case "list_tasks": {
                        const res = await tasks.tasks.list({
                            tasklist: args.taskListId,
                            showCompleted: args.showCompleted,
                            showHidden: args.showHidden,
                            dueMin: args.dueMin,
                            dueMax: args.dueMax,
                            maxResults: args.maxResults,
                        });

                        const items = (res.data.items ?? []).map((t) => ({
                            id: t.id,
                            title: t.title,
                            notes: t.notes,
                            status: t.status,
                            due: t.due,
                            completed: t.completed,
                            parent: t.parent,
                            position: t.position,
                            updated: t.updated,
                        }));
                        return jsonResult(items);
                    }

                    case "get_task": {
                        const res = await tasks.tasks.get({
                            tasklist: args.taskListId,
                            task: args.taskId,
                        });
                        return jsonResult(res.data);
                    }

                    case "create_task": {
                        const requestBody: Record<string, unknown> = {
                            title: args.title,
                        };
                        if (args.notes) requestBody.notes = args.notes;
                        if (args.due) requestBody.due = args.due;

                        const res = await tasks.tasks.insert({
                            tasklist: args.taskListId,
                            parent: args.parent,
                            requestBody,
                        });
                        return jsonResult(res.data);
                    }

                    case "update_task": {
                        // fetch existing to merge
                        const existing = await tasks.tasks.get({
                            tasklist: args.taskListId,
                            task: args.taskId,
                        });

                        const requestBody: Record<string, unknown> = {
                            ...existing.data,
                        };
                        if (args.title !== undefined) requestBody.title = args.title;
                        if (args.notes !== undefined) requestBody.notes = args.notes;
                        if (args.due !== undefined) requestBody.due = args.due;
                        if (args.status !== undefined) {
                            requestBody.status = args.status;
                            if (args.status === "completed") {
                                requestBody.completed = new Date().toISOString();
                            } else {
                                requestBody.completed = null;
                            }
                        }

                        const res = await tasks.tasks.update({
                            tasklist: args.taskListId,
                            task: args.taskId,
                            requestBody,
                        });
                        return jsonResult(res.data);
                    }

                    case "delete_task": {
                        await tasks.tasks.delete({
                            tasklist: args.taskListId,
                            task: args.taskId,
                        });
                        return jsonResult({ deleted: args.taskId });
                    }

                    case "complete_task": {
                        const existing = await tasks.tasks.get({
                            tasklist: args.taskListId,
                            task: args.taskId,
                        });

                        const res = await tasks.tasks.update({
                            tasklist: args.taskListId,
                            task: args.taskId,
                            requestBody: {
                                ...existing.data,
                                status: "completed",
                                completed: new Date().toISOString(),
                            },
                        });
                        return jsonResult(res.data);
                    }

                    case "move_task": {
                        const res = await tasks.tasks.move({
                            tasklist: args.taskListId,
                            task: args.taskId,
                            parent: args.parent,
                            previous: args.previous,
                        });
                        return jsonResult(res.data);
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Tasks ${args.action} failed`, message);
            }
        }
    );
}

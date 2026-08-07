import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";
import { resolveCalendar } from "../lib/resolveAuth.ts";

const calendarId = z.string().optional().default("primary").describe("Calendar ID (default: primary)");
const eventId = z.string().describe("Calendar event ID");

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("list_events"),
        calendarId,
        timeMin: z.string().optional().describe("Start of time range (ISO 8601). Defaults to now."),
        timeMax: z.string().optional().describe("End of time range (ISO 8601)"),
        query: z.string().optional().describe("Free text search across event fields"),
        maxResults: z.number().optional().default(25).describe("Max events to return"),
        singleEvents: z.boolean().optional().default(true).describe("Expand recurring events into instances"),
    }),

    z.object({
        action: z.literal("get_event"),
        calendarId,
        eventId,
    }),

    z.object({
        action: z.literal("create_event"),
        calendarId,
        summary: z.string().describe("Event title"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        start: z.string().describe("Start time (ISO 8601) or date (YYYY-MM-DD for all-day)"),
        end: z.string().describe("End time (ISO 8601) or date (YYYY-MM-DD for all-day)"),
        timeZone: z.string().optional().describe("IANA timezone, e.g. Asia/Kolkata"),
        attendees: z.array(z.string()).optional().describe("List of attendee email addresses"),
        recurrence: z.array(z.string()).optional().describe("RRULE strings, e.g. ['RRULE:FREQ=WEEKLY;COUNT=5']"),
        reminders: z.array(z.object({
            method: z.enum(["email", "popup"]),
            minutes: z.number(),
        })).optional().describe("Custom reminders"),
        colorId: z.string().optional().describe("Event color ID (1-11)"),
    }),

    z.object({
        action: z.literal("update_event"),
        calendarId,
        eventId,
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional().describe("New start time (ISO 8601)"),
        end: z.string().optional().describe("New end time (ISO 8601)"),
        timeZone: z.string().optional(),
        attendees: z.array(z.string()).optional(),
        colorId: z.string().optional(),
    }),

    z.object({
        action: z.literal("delete_event"),
        calendarId,
        eventId,
    }),

    z.object({
        action: z.literal("list_calendars"),
    }),

    z.object({
        action: z.literal("quick_add"),
        calendarId,
        text: z.string().describe("Natural language event description, e.g. 'Lunch with Bob tomorrow at noon'"),
    }),
]);

// detect whether a datetime string is a date-only (all-day event)
function isDateOnly(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function buildDateTime(value: string, timeZone?: string) {
    if (isDateOnly(value)) return { date: value };
    return { dateTime: value, timeZone };
}

// format event data into a clean summary
function formatEvent(event: Record<string, unknown>) {
    return {
        id: event.id,
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        status: event.status,
        htmlLink: event.htmlLink,
        attendees: event.attendees,
        recurrence: event.recurrence,
        colorId: event.colorId,
        creator: event.creator,
        organizer: event.organizer,
    };
}

export function registerCalendarTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_calendar",
        {
            title: "Google Calendar",
            description: "List, create, update, delete calendar events. Quick-add events from natural language. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args, extra) => {
            const cal = resolveCalendar(auth, extra);

            try {
                switch (args.action) {
                    case "list_events": {
                        const res = await cal.events.list({
                            calendarId: args.calendarId,
                            timeMin: args.timeMin ?? new Date().toISOString(),
                            timeMax: args.timeMax,
                            q: args.query,
                            maxResults: args.maxResults,
                            singleEvents: args.singleEvents,
                            orderBy: args.singleEvents ? "startTime" : undefined,
                        });

                        const events = (res.data.items ?? []).map((e) =>
                            formatEvent(e as Record<string, unknown>)
                        );
                        return jsonResult(events);
                    }

                    case "get_event": {
                        const res = await cal.events.get({
                            calendarId: args.calendarId,
                            eventId: args.eventId,
                        });
                        return jsonResult(formatEvent(res.data as Record<string, unknown>));
                    }

                    case "create_event": {
                        const requestBody: Record<string, unknown> = {
                            summary: args.summary,
                            start: buildDateTime(args.start, args.timeZone),
                            end: buildDateTime(args.end, args.timeZone),
                        };

                        if (args.description) requestBody.description = args.description;
                        if (args.location) requestBody.location = args.location;
                        if (args.attendees) {
                            requestBody.attendees = args.attendees.map((email) => ({ email }));
                        }
                        if (args.recurrence) requestBody.recurrence = args.recurrence;
                        if (args.colorId) requestBody.colorId = args.colorId;
                        if (args.reminders) {
                            requestBody.reminders = {
                                useDefault: false,
                                overrides: args.reminders,
                            };
                        }

                        const res = await cal.events.insert({
                            calendarId: args.calendarId,
                            requestBody,
                            sendUpdates: args.attendees ? "all" : "none",
                        });
                        return jsonResult(formatEvent(res.data as Record<string, unknown>));
                    }

                    case "update_event": {
                        // fetch existing event to merge changes
                        const existing = await cal.events.get({
                            calendarId: args.calendarId,
                            eventId: args.eventId,
                        });

                        const requestBody: Record<string, unknown> = {
                            ...existing.data,
                        };

                        if (args.summary !== undefined) requestBody.summary = args.summary;
                        if (args.description !== undefined) requestBody.description = args.description;
                        if (args.location !== undefined) requestBody.location = args.location;
                        if (args.start) requestBody.start = buildDateTime(args.start, args.timeZone);
                        if (args.end) requestBody.end = buildDateTime(args.end, args.timeZone);
                        if (args.colorId !== undefined) requestBody.colorId = args.colorId;
                        if (args.attendees) {
                            requestBody.attendees = args.attendees.map((email) => ({ email }));
                        }

                        const res = await cal.events.update({
                            calendarId: args.calendarId,
                            eventId: args.eventId,
                            requestBody,
                            sendUpdates: args.attendees ? "all" : "none",
                        });
                        return jsonResult(formatEvent(res.data as Record<string, unknown>));
                    }

                    case "delete_event": {
                        await cal.events.delete({
                            calendarId: args.calendarId,
                            eventId: args.eventId,
                        });
                        return jsonResult({ deleted: args.eventId });
                    }

                    case "list_calendars": {
                        const res = await cal.calendarList.list();
                        const calendars = (res.data.items ?? []).map((c) => ({
                            id: c.id,
                            summary: c.summary,
                            description: c.description,
                            primary: c.primary,
                            timeZone: c.timeZone,
                            backgroundColor: c.backgroundColor,
                        }));
                        return jsonResult(calendars);
                    }

                    case "quick_add": {
                        const res = await cal.events.quickAdd({
                            calendarId: args.calendarId,
                            text: args.text,
                        });
                        return jsonResult(formatEvent(res.data as Record<string, unknown>));
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Calendar ${args.action} failed`, message);
            }
        }
    );
}

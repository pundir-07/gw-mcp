import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { jsonResult, errorResult } from "../lib/response.ts";

const spreadsheetId = z.string().describe("Google Sheets spreadsheet ID");
const range = z.string().describe("A1 notation range, e.g. 'Sheet1!A1:D10' or 'Sheet1'");

const ActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("get"),
        spreadsheetId,
    }),

    z.object({
        action: z.literal("read_range"),
        spreadsheetId,
        range,
        valueRenderOption: z.enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"]).optional().default("FORMATTED_VALUE")
            .describe("How values should be rendered"),
    }),

    z.object({
        action: z.literal("write_range"),
        spreadsheetId,
        range,
        values: z.array(z.array(z.unknown())).describe("2D array of values, each inner array is a row"),
        valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED")
            .describe("How input data should be interpreted"),
    }),

    z.object({
        action: z.literal("append"),
        spreadsheetId,
        range: range.describe("Range to determine the table to append to, e.g. 'Sheet1!A:E'"),
        values: z.array(z.array(z.unknown())).describe("Rows to append"),
        valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED"),
    }),

    z.object({
        action: z.literal("create"),
        title: z.string().describe("Spreadsheet title"),
        sheetTitles: z.array(z.string()).optional().describe("Names of sheet tabs to create (default: one sheet called 'Sheet1')"),
    }),

    z.object({
        action: z.literal("add_sheet"),
        spreadsheetId,
        title: z.string().describe("New sheet tab name"),
    }),

    z.object({
        action: z.literal("clear_range"),
        spreadsheetId,
        range,
    }),

    z.object({
        action: z.literal("batch_update"),
        spreadsheetId,
        requests: z.array(z.record(z.string(), z.unknown())).describe("Array of Sheets API batchUpdate request objects (for formatting, merging, etc.)"),
    }),
]);

export function registerSheetsTool(server: McpServer, auth: GoogleAuth): void {
    server.registerTool(
        "google_sheets",
        {
            title: "Google Sheets",
            description: "Read, write, append, and manage Google Sheets. Create spreadsheets, add tabs, clear ranges, or send raw batchUpdate requests. Use the 'action' field to pick an operation.",
            inputSchema: ActionSchema,
        },
        async (args) => {
            const sheets = auth.getSheets();

            try {
                switch (args.action) {
                    case "get": {
                        const res = await sheets.spreadsheets.get({
                            spreadsheetId: args.spreadsheetId,
                        });
                        return jsonResult({
                            spreadsheetId: res.data.spreadsheetId,
                            title: res.data.properties?.title,
                            locale: res.data.properties?.locale,
                            sheets: (res.data.sheets ?? []).map((s) => ({
                                sheetId: s.properties?.sheetId,
                                title: s.properties?.title,
                                index: s.properties?.index,
                                rowCount: s.properties?.gridProperties?.rowCount,
                                columnCount: s.properties?.gridProperties?.columnCount,
                            })),
                            url: res.data.spreadsheetUrl,
                        });
                    }

                    case "read_range": {
                        const res = await sheets.spreadsheets.values.get({
                            spreadsheetId: args.spreadsheetId,
                            range: args.range,
                            valueRenderOption: args.valueRenderOption,
                        });
                        return jsonResult({
                            range: res.data.range,
                            values: res.data.values ?? [],
                        });
                    }

                    case "write_range": {
                        const res = await sheets.spreadsheets.values.update({
                            spreadsheetId: args.spreadsheetId,
                            range: args.range,
                            valueInputOption: args.valueInputOption,
                            requestBody: { values: args.values },
                        });
                        return jsonResult({
                            updatedRange: res.data.updatedRange,
                            updatedRows: res.data.updatedRows,
                            updatedColumns: res.data.updatedColumns,
                            updatedCells: res.data.updatedCells,
                        });
                    }

                    case "append": {
                        const res = await sheets.spreadsheets.values.append({
                            spreadsheetId: args.spreadsheetId,
                            range: args.range,
                            valueInputOption: args.valueInputOption,
                            requestBody: { values: args.values },
                        });
                        return jsonResult({
                            updatedRange: res.data.updates?.updatedRange,
                            updatedRows: res.data.updates?.updatedRows,
                            updatedCells: res.data.updates?.updatedCells,
                        });
                    }

                    case "create": {
                        const sheetsConfig = (args.sheetTitles ?? ["Sheet1"]).map(
                            (title) => ({ properties: { title } })
                        );

                        const res = await sheets.spreadsheets.create({
                            requestBody: {
                                properties: { title: args.title },
                                sheets: sheetsConfig,
                            },
                        });
                        return jsonResult({
                            spreadsheetId: res.data.spreadsheetId,
                            title: res.data.properties?.title,
                            url: res.data.spreadsheetUrl,
                            sheets: (res.data.sheets ?? []).map((s) => ({
                                sheetId: s.properties?.sheetId,
                                title: s.properties?.title,
                            })),
                        });
                    }

                    case "add_sheet": {
                        const res = await sheets.spreadsheets.batchUpdate({
                            spreadsheetId: args.spreadsheetId,
                            requestBody: {
                                requests: [{
                                    addSheet: {
                                        properties: { title: args.title },
                                    },
                                }],
                            },
                        });
                        const reply = res.data.replies?.[0]?.addSheet;
                        return jsonResult({
                            sheetId: reply?.properties?.sheetId,
                            title: reply?.properties?.title,
                        });
                    }

                    case "clear_range": {
                        const res = await sheets.spreadsheets.values.clear({
                            spreadsheetId: args.spreadsheetId,
                            range: args.range,
                        });
                        return jsonResult({ clearedRange: res.data.clearedRange });
                    }

                    case "batch_update": {
                        const res = await sheets.spreadsheets.batchUpdate({
                            spreadsheetId: args.spreadsheetId,
                            requestBody: { requests: args.requests },
                        });
                        return jsonResult(res.data);
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return errorResult(`Sheets ${args.action} failed`, message);
            }
        }
    );
}

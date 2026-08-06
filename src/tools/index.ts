import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { registerDriveTool } from "./drive.ts";
import { registerGmailTool } from "./gmail.ts";
import { registerCalendarTool } from "./calendar.ts";
import { registerTasksTool } from "./tasks.ts";
import { registerDocsTool } from "./docs.ts";
import { registerSheetsTool } from "./sheets.ts";

export function registerAllTools(server: McpServer, auth: GoogleAuth): void {
    registerDriveTool(server, auth);
    registerGmailTool(server, auth);
    registerCalendarTool(server, auth);
    registerTasksTool(server, auth);
    registerDocsTool(server, auth);
    registerSheetsTool(server, auth);
}

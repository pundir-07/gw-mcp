import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";
import { registerDriveTool } from "./drive.ts";
import { registerGmailTool } from "./gmail.ts";

export function registerAllTools(server: McpServer, auth: GoogleAuth): void {
    registerDriveTool(server, auth);
    registerGmailTool(server, auth);
}

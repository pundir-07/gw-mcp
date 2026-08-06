import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GoogleAuth } from "./auth/GoogleAuth.ts";
import { registerAllTools } from "./tools/index.ts";
import { SERVER_NAME, SERVER_VERSION } from "./config.ts";

export function createServer(): McpServer {
    const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    });

    const auth = new GoogleAuth();
    registerAllTools(server, auth);

    return server;
}

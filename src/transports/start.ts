import http from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveTransport, resolvePort } from "../config.ts";

export async function startServer(server: McpServer): Promise<void> {
    const mode = resolveTransport();

    if (mode === "stdio") {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error(`[mcp] running on stdio`);
        return;
    }

    // HTTP mode — stateless, one transport per request
    const port = resolvePort();

    const httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (url.pathname !== "/mcp") {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        await server.connect(transport);
        await transport.handleRequest(req, res);
    });

    httpServer.listen(port, () => {
        console.error(`[mcp] HTTP server listening on http://localhost:${port}/mcp`);
    });
}

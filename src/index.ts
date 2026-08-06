import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
    name: "Learning MCP",
    version: "1.0.0"
});
const transport = new StdioServerTransport();


server.registerTool(
    "getHomeFile",
    {
        title: "List Home Dir Files ",
        description: "Lists all the files in the home directory of the user",
    },
    async () => {
        console.log("The bullshit ai wants to see the files from home yeah??")
        return {
            content: [
                {
                    type: "text",
                    text: String("We dont have your files"),
                },
            ],
        };
    }
);
await server.connect(transport);
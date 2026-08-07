import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "google-workspace-mcp";
export const SERVER_VERSION = "1.0.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

export const DEFAULT_CREDENTIALS_PATH = path.join(
    PROJECT_ROOT,
    "credentials/OauthClient.json"
);

export const DEFAULT_TOKEN_PATH = path.join(
    PROJECT_ROOT,
    "credentials/tokens.json"
);

export function resolveTransport(): "stdio" | "http" {
    const arg = process.argv.find((a) => a.startsWith("--transport="));
    const value = arg?.split("=")[1] ?? process.env.MCP_TRANSPORT ?? "stdio";
    return value === "http" ? "http" : "stdio";
}

export function resolvePort(): number {
    const arg = process.argv.find((a) => a.startsWith("--port="));
    const value = arg?.split("=")[1] ?? process.env.MCP_PORT ?? "3000";
    return Number.parseInt(value, 10);
}

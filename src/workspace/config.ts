import path from "node:path";

export const SERVER_NAME = "google-workspace";
export const SERVER_VERSION = "1.0.0";

export const DEFAULT_CLIENT_CREDENTIALS = path.join(
    process.cwd(),
    "credentials/OauthClient.json"
);
export const DEFAULT_TOKEN_PATH = path.join(
    process.cwd(),
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

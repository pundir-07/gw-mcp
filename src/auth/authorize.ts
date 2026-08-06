/**
 * CLI script to obtain OAuth tokens.
 * Run: npm run auth
 *
 * Opens browser → user grants consent → local server catches redirect → saves tokens.
 */
import http from "node:http";
import { execSync } from "node:child_process";
import { GoogleAuth } from "./GoogleAuth.ts";

const PORT = 3333;
const auth = new GoogleAuth();
const authUrl = auth.getAuthUrl();

console.log("\n🔐 Opening browser for Google OAuth...\n");
console.log(`If it doesn't open, visit:\n${authUrl}\n`);

// open browser (macOS)
try {
    execSync(`open "${authUrl}"`);
} catch {
    // fallback: user copies URL manually
}

// tiny server to catch the OAuth redirect
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (!url.pathname.startsWith("/callback") && url.pathname !== "/") {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
        res.writeHead(400);
        res.end("Missing authorization code");
        return;
    }

    try {
        await auth.exchangeCode(code);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>✅ Authorized! You can close this tab.</h1>");
        console.log("✅ Tokens saved. You can now start the MCP server.\n");
    } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>❌ Error</h1><pre>${String(err)}</pre>`);
        console.error("❌ Token exchange failed:", err);
    }

    // shut down after handling
    setTimeout(() => process.exit(0), 500);
});

server.listen(PORT, () => {
    console.log(`Waiting for OAuth callback on http://localhost:${PORT} ...\n`);
});

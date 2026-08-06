import fs from "node:fs";
import path from "node:path";
import { google, type Auth, type drive_v3, type gmail_v1, type calendar_v3, type tasks_v1, type docs_v1, type sheets_v4 } from "googleapis";
import { DEFAULT_CLIENT_CREDENTIALS, DEFAULT_TOKEN_PATH } from "../config.ts";
import { WORKSPACE_SCOPES } from "./scopes.ts";

type OAuthClientConfig = {
    installed: {
        client_id: string;
        client_secret: string;
        redirect_uris: string[];
    };
};

export class GoogleAuth {
    private oauth2Client: Auth.OAuth2Client | null = null;
    private clients: {
        drive?: drive_v3.Drive;
        gmail?: gmail_v1.Gmail;
        calendar?: calendar_v3.Calendar;
        tasks?: tasks_v1.Tasks;
        docs?: docs_v1.Docs;
        sheets?: sheets_v4.Sheets;
    } = {};

    constructor(
        private readonly clientCredentialsPath = process.env.GOOGLE_CLIENT_CREDENTIALS_PATH ?? DEFAULT_CLIENT_CREDENTIALS,
        private readonly tokenPath = process.env.GOOGLE_TOKEN_PATH ?? DEFAULT_TOKEN_PATH
    ) {}

    getAuthUrl(): string {
        const client = this.getOAuthClient();
        return client.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: [...WORKSPACE_SCOPES],
        });
    }

    async exchangeCode(code: string): Promise<Auth.Credentials> {
        const client = this.getOAuthClient();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        this.persistTokens(tokens);
        this.clients = {};
        return tokens;
    }

    private getOAuthClient(): Auth.OAuth2Client {
        if (this.oauth2Client) return this.oauth2Client;

        const raw = fs.readFileSync(this.clientCredentialsPath, "utf8");
        const credentials = JSON.parse(raw) as OAuthClientConfig;
        const { client_id, client_secret, redirect_uris } = credentials.installed;

        this.oauth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris[0]
        );

        if (!fs.existsSync(this.tokenPath)) {
            throw new Error(
                `Missing token file at ${this.tokenPath}. Run: npm run workspace:auth`
            );
        }

        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf8")) as Auth.Credentials;
        this.oauth2Client.setCredentials(tokens);

        this.oauth2Client.on("tokens", (fresh) => {
            const merged = { ...tokens, ...fresh };
            this.persistTokens(merged);
        });

        return this.oauth2Client;
    }

    private persistTokens(tokens: Auth.Credentials): void {
        fs.mkdirSync(path.dirname(this.tokenPath), { recursive: true });
        fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
    }

    private auth(): Auth.OAuth2Client {
        return this.getOAuthClient();
    }

    getDrive(): drive_v3.Drive {
        return (this.clients.drive ??= google.drive({ version: "v3", auth: this.auth() }));
    }

    getGmail(): gmail_v1.Gmail {
        return (this.clients.gmail ??= google.gmail({ version: "v1", auth: this.auth() }));
    }

    getCalendar(): calendar_v3.Calendar {
        return (this.clients.calendar ??= google.calendar({ version: "v3", auth: this.auth() }));
    }

    getTasks(): tasks_v1.Tasks {
        return (this.clients.tasks ??= google.tasks({ version: "v1", auth: this.auth() }));
    }

    getDocs(): docs_v1.Docs {
        return (this.clients.docs ??= google.docs({ version: "v1", auth: this.auth() }));
    }

    getSheets(): sheets_v4.Sheets {
        return (this.clients.sheets ??= google.sheets({ version: "v4", auth: this.auth() }));
    }
}

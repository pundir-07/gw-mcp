import fs from "node:fs";
import path from "node:path";
import {
    google,
    type Auth,
    type drive_v3,
    type gmail_v1,
    type calendar_v3,
    type tasks_v1,
    type docs_v1,
    type sheets_v4,
} from "googleapis";
import { DEFAULT_CREDENTIALS_PATH, DEFAULT_TOKEN_PATH } from "../config.ts";
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

    // lazy-cached API clients
    private _drive: drive_v3.Drive | null = null;
    private _gmail: gmail_v1.Gmail | null = null;
    private _calendar: calendar_v3.Calendar | null = null;
    private _tasks: tasks_v1.Tasks | null = null;
    private _docs: docs_v1.Docs | null = null;
    private _sheets: sheets_v4.Sheets | null = null;

    constructor(
        private readonly credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH ?? DEFAULT_CREDENTIALS_PATH,
        private readonly tokenPath = process.env.GOOGLE_TOKEN_PATH ?? DEFAULT_TOKEN_PATH
    ) {}

    // -- OAuth helpers for the authorize CLI script --

    getAuthClient(): Auth.OAuth2Client {
        return this.ensureClient();
    }

    getAuthUrl(): string {
        return this.ensureClient().generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: [...WORKSPACE_SCOPES],
        });
    }

    async exchangeCode(code: string): Promise<Auth.Credentials> {
        const client = this.ensureClient();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        this.persistTokens(tokens);
        this.resetClients();
        return tokens;
    }

    // -- API client getters (lazy, cached) --

    getDrive(): drive_v3.Drive {
        return (this._drive ??= google.drive({ version: "v3", auth: this.auth() }));
    }

    getGmail(): gmail_v1.Gmail {
        return (this._gmail ??= google.gmail({ version: "v1", auth: this.auth() }));
    }

    getCalendar(): calendar_v3.Calendar {
        return (this._calendar ??= google.calendar({ version: "v3", auth: this.auth() }));
    }

    getTasks(): tasks_v1.Tasks {
        return (this._tasks ??= google.tasks({ version: "v1", auth: this.auth() }));
    }

    getDocs(): docs_v1.Docs {
        return (this._docs ??= google.docs({ version: "v1", auth: this.auth() }));
    }

    getSheets(): sheets_v4.Sheets {
        return (this._sheets ??= google.sheets({ version: "v4", auth: this.auth() }));
    }

    // -- internals --

    private auth(): Auth.OAuth2Client {
        const client = this.ensureClient();

        if (!fs.existsSync(this.tokenPath)) {
            throw new Error(
                `No token file at ${this.tokenPath}. Run: npm run auth`
            );
        }

        const tokens = JSON.parse(
            fs.readFileSync(this.tokenPath, "utf8")
        ) as Auth.Credentials;
        client.setCredentials(tokens);

        return client;
    }

    private ensureClient(): Auth.OAuth2Client {
        if (this.oauth2Client) return this.oauth2Client;

        const raw = fs.readFileSync(this.credentialsPath, "utf8");
        const config = JSON.parse(raw) as OAuthClientConfig;
        const { client_id, client_secret, redirect_uris } = config.installed;

        this.oauth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris[0]
        );

        // auto-persist refreshed tokens
        this.oauth2Client.on("tokens", (fresh) => {
            const existing = fs.existsSync(this.tokenPath)
                ? (JSON.parse(fs.readFileSync(this.tokenPath, "utf8")) as Auth.Credentials)
                : {};
            this.persistTokens({ ...existing, ...fresh });
        });

        return this.oauth2Client;
    }

    private persistTokens(tokens: Auth.Credentials): void {
        fs.mkdirSync(path.dirname(this.tokenPath), { recursive: true });
        fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
    }

    private resetClients(): void {
        this._drive = null;
        this._gmail = null;
        this._calendar = null;
        this._tasks = null;
        this._docs = null;
        this._sheets = null;
    }
}

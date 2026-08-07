import { google, type Auth, type drive_v3, type gmail_v1, type calendar_v3, type tasks_v1, type docs_v1, type sheets_v4 } from "googleapis";
import type { GoogleAuth } from "../auth/GoogleAuth.ts";

type Extra = {
    requestInfo?: {
        headers?: Record<string, string | string[] | undefined>;
    };
};

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const v = headers[key];
    if (Array.isArray(v)) return v[0];
    return v;
}

function ephemeralClient(extra?: Extra): Auth.OAuth2Client | null {
    const headers = extra?.requestInfo?.headers;
    if (!headers) return null;

    const accessToken = headerValue(headers, "x-google-access-token");
    if (!accessToken) return null;

    const client = new google.auth.OAuth2();
    client.setCredentials({
        access_token: accessToken,
        refresh_token: headerValue(headers, "x-google-refresh-token"),
    });
    return client;
}

export function resolveDrive(auth: GoogleAuth, extra?: Extra): drive_v3.Drive {
    const client = ephemeralClient(extra);
    return client ? google.drive({ version: "v3", auth: client }) : auth.getDrive();
}

export function resolveGmail(auth: GoogleAuth, extra?: Extra): gmail_v1.Gmail {
    const client = ephemeralClient(extra);
    return client ? google.gmail({ version: "v1", auth: client }) : auth.getGmail();
}

export function resolveCalendar(auth: GoogleAuth, extra?: Extra): calendar_v3.Calendar {
    const client = ephemeralClient(extra);
    return client ? google.calendar({ version: "v3", auth: client }) : auth.getCalendar();
}

export function resolveTasks(auth: GoogleAuth, extra?: Extra): tasks_v1.Tasks {
    const client = ephemeralClient(extra);
    return client ? google.tasks({ version: "v1", auth: client }) : auth.getTasks();
}

export function resolveDocs(auth: GoogleAuth, extra?: Extra): docs_v1.Docs {
    const client = ephemeralClient(extra);
    return client ? google.docs({ version: "v1", auth: client }) : auth.getDocs();
}

export function resolveSheets(auth: GoogleAuth, extra?: Extra): sheets_v4.Sheets {
    const client = ephemeralClient(extra);
    return client ? google.sheets({ version: "v4", auth: client }) : auth.getSheets();
}

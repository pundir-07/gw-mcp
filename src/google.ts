import { google } from "googleapis";
import fs from "fs";
import path from "path";

const credentials = JSON.parse(
    fs.readFileSync(
        path.join(process.cwd(), "credentials/OauthClient.json"),
        "utf8"
    )
);
const { client_id, client_secret, redirect_uris } =
    credentials.installed;

export const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
);
// const authUrl = oauth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: [
//         "https://www.googleapis.com/auth/drive"
//     ]
// });
const tokens = JSON.parse(fs.readFileSync(path.join(process.cwd(), "credentials", "tokens.json"), "utf-8"))
oauth2Client.setCredentials(tokens)
const drive = google.drive({
    version: "v3",
    auth: oauth2Client,
});
const response = await drive.files.list({
    pageSize: 10,
    fields: "files(id, name, mimeType)",
});
console.log(response.data.files);
// console.log(credentials)
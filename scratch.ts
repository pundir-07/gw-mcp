import { GoogleAuth } from "./src/auth/GoogleAuth.ts";
async function run() {
    const auth = new GoogleAuth();
    const drive = auth.getDrive();
    try {
        const res = await drive.files.list({ pageSize: 1 });
        console.log("Success!", res.data.files);
    } catch (err) {
        console.error("Failed:", err.message);
    }
}
run();

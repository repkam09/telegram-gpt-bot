import http from "node:http";
import { google } from "googleapis";
import { Config } from "../singletons/config";

async function run() {
    const REDIRECT_URI = "https://api.repkam09.dev/callback";
    const PORT = 16001;


    console.log("ID:", Config.GMAIL_CLIENT_ID);
    console.log("Secret:", Config.GMAIL_CLIENT_SECRET);
    console.log("Redirect:", REDIRECT_URI);

    const auth = new google.auth.OAuth2(Config.GMAIL_CLIENT_ID, Config.GMAIL_CLIENT_SECRET, REDIRECT_URI);

    const authUrl = auth.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly"],
        prompt: "select_account consent", // forces Google to return a refresh token
    });

    console.log("Visit this URL and authorize the app:\n", authUrl);

    const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith("/callback")) {
            console.warn("Received request to unknown path:", req.url);
            res.end("Not found.");
            return;
        }

        const code = new URL(req.url, "https://api.repkam09.dev").searchParams.get("code");
        if (!code) {
            res.end("No code found in callback.");
            return;
        }

        res.end("Authorization successful! You can close this tab.");
        server.close();

        const { tokens } = await auth.getToken(code);
        console.log("\nRefresh Token:", tokens.refresh_token);
        console.log("\nAdd these to your environment:");
        console.log(`GMAIL_CLIENT_ID=${Config.GMAIL_CLIENT_ID}`);
        console.log(`GMAIL_CLIENT_SECRET=${Config.GMAIL_CLIENT_SECRET}`);
        console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    });

    server.listen(PORT, () => {
        console.log(`Waiting for Google to redirect to localhost:${PORT}...`);
    });
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
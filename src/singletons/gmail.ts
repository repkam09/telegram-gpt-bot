import { gmail_v1, google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Config } from "../singletons/config";

export interface RawEmail {
    id: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    body: string;
}

export class GmailInstance {
    private static _auth: OAuth2Client;

    static async init(): Promise<void> {
        const auth = new google.auth.OAuth2(
            Config.GMAIL_CLIENT_ID,
            Config.GMAIL_CLIENT_SECRET,
        );

        auth.setCredentials({
            refresh_token: Config.GMAIL_REFRESH_TOKEN,
        });

        GmailInstance._auth = auth;
    }

    public static api() {
        return google.gmail({ version: "v1", auth: GmailInstance._auth });
    }

    public static async emails(since: Date): Promise<RawEmail[]> {
        const afterTimestamp = Math.floor(since.getTime() / 1000);

        const listRes = await GmailInstance.api().users.messages.list({
            userId: Config.GMAIL_ADDRESS,
            q: `after:${afterTimestamp}`,
            maxResults: 50,
        });

        const messages = listRes.data.messages ?? [];
        if (messages.length === 0) return [];

        const emails = await Promise.all(
            messages.map(msg => GmailInstance.fetchEmailById(msg.id!))
        );

        return emails.filter((e): e is RawEmail => e !== null);
    }

    private static async fetchEmailById(
        messageId: string
    ): Promise<RawEmail | null> {
        const res = await GmailInstance.api().users.messages.get({
            userId: Config.GMAIL_ADDRESS,
            id: messageId,
            format: "full",
        });

        const msg = res.data;
        const headers = msg.payload?.headers ?? [];

        const get = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

        const body = GmailInstance.extractBody(msg.payload);

        const deliveredTo = get("Delivered-To");
        if (deliveredTo && deliveredTo !== Config.GMAIL_ADDRESS) {
            // This email was delivered to a different address (e.g. alias), skip it
            return null;
        }

        return {
            id: messageId,
            subject: get("Subject"),
            from: get("From"),
            to: get("Delivered-To"),
            date: get("Date"),
            body,
        };
    }

    private static extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
        if (!payload) return "";

        // Prefer plain text, fall back to HTML
        if (payload.mimeType === "text/plain" && payload.body?.data) {
            return Buffer.from(payload.body.data, "base64url").toString("utf-8");
        }

        if (payload.parts) {
            for (const part of payload.parts) {
                const text = GmailInstance.extractBody(part);
                if (text) return text;
            }
        }

        if (payload.body?.data) {
            return Buffer.from(payload.body.data, "base64url").toString("utf-8");
        }

        return "";
    }
}

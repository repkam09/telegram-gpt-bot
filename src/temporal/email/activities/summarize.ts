import { RawEmail } from "../../../singletons/gmail";

/**
 * Summarizes a list of emails.
 * 
 * @param emails - The emails to summarize.
 * @returns A summary of the emails.
 */
export async function summarizeEmails(emails: RawEmail[]): Promise<string> {
    return emails.map((email) => JSON.stringify(email)).join("\n");
}
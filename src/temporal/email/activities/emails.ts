import { GmailInstance, RawEmail } from "../../../singletons/gmail";

/**
 * Check Gmail for new messages and return their IDs
 */
export async function fetchEmails(): Promise<string[]> {
    return GmailInstance.fetchEmails();
}

/**
 * Fetch a single email by its ID. 
 * Returns null if the email was not delivered to our address (e.g. it was sent to an alias).
 * 
 * @param messageId The ID of the email to fetch
 * @returns The email if found and delivered to our address, otherwise null
 */
export async function fetchEmailById(
    messageId: string
): Promise<RawEmail | null> {
    return GmailInstance.fetchEmailById(messageId);
}
import { GmailInstance } from "../singletons/gmail";

async function run() {
    await GmailInstance.init();

    // Get emails in the last 4 hours
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const emails = await GmailInstance.emails(since);

    console.log(`Found ${emails.length} emails in the last 4 hours:`);
    for (const email of emails) {
        console.log(`- ${email.subject} (from: ${email.from}, to: ${email.to}, date: ${email.date})`);
    }
}


run().catch((err) => {
    console.error(err);
    process.exit(1);
});
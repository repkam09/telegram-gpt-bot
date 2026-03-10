
import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "./activities";
import type { RawEmail } from "../../singletons/gmail";

const { fetchEmailById, fetchEmails, signalSummary } = proxyActivities<typeof activities>({
    startToCloseTimeout: "60 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { summarizeEmails } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

export async function reviewEmailWorkflow() {
    const emails = await fetchEmails();

    log.info(`Found ${emails.length} emails to review`);

    const summarize: RawEmail[] = [];
    for (const email of emails) {
        const fullEmail = await fetchEmailById(email);
        if (fullEmail) {
            log.debug(`Adding email to summarize queue: ${fullEmail.subject} (from: ${fullEmail.from}, to: ${fullEmail.to}, date: ${fullEmail.date})`);
            summarize.push(fullEmail);
        }
    }

    if (summarize.length === 0) {
        log.info("No emails to summarize, exiting workflow");
        return;
    }

    log.debug(`Total emails to summarize: ${summarize.length}`);
    const summary = await summarizeEmails(summarize);

    log.debug(`Summary generated: ${summary}`);

    await signalSummary(summary);
    log.info("Summary sent to signal, workflow complete");
}
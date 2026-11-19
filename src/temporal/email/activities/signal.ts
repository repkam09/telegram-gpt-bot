import { signalLegacyWorkflowAdminExternalContext } from "../../legacy/interface";

export function signalSummary(summary: string): Promise<void> {
    return signalLegacyWorkflowAdminExternalContext("scheduled_email_digest", summary);
}

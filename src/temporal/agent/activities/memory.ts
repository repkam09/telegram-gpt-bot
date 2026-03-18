import { AgentCoreInstance } from "../../../singletons/agentcore";
import { Config } from "../../../singletons/config";
import { Logger } from "../../../singletons/logger";
import { persistMemoryEvent as internalPersistMemoryEvent } from "../../memory/interface";
import { Context } from "@temporalio/activity";
import { parseWorkflowId } from "../interface";


export async function persistMemoryEvent(input: { role: "user" | "assistant"; content: string }): Promise<void> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const workflowType = Context.current().info.workflowType;
    const runId = Context.current().info.workflowExecution.runId;

    let userId = null;
    if (workflowType === "agentWorkflow") {
        const parts = parseWorkflowId(workflowId);
        userId = parts.chatId;
    }

    if (!userId) {
        Logger.warn("PersistMemoryActivity", `Could not determine userId from workflowId ${workflowId}. Skipping memory persistence.`);
        return;
    }

    Logger.debug("PersistMemoryActivity", `Persisting memory events for user ${workflowId} and session ${runId}: ${JSON.stringify(input)}`);

    if (!Config.HENNOS_MEMORY_ENABLED) {
        Logger.debug("PersistMemoryActivity", "Memory persistence is disabled. Skipping.");
        return;
    }

    if (Config.BEDROCK_MEMORY_ID) {
        return AgentCoreInstance.createEvent(userId, runId, [{ text: input.content, role: input.role }]);
    }

    return internalPersistMemoryEvent(userId, runId, [{ role: input.role, content: input.content }]);
}
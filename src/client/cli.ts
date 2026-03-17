import readline from "node:readline/promises";
import { Config } from "../singletons/config";
import { createTemporalClient } from "../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal } from "../temporal/workflows";
import { createWorkflowId } from "../temporal/agent/interface";
import { AgentResponseHandler } from "../response";

export class CommandLineInstance {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            console.error("CommandLineInstance can only be used in development mode.");
            throw new Error("CommandLineInstance should not be used in production mode.");
        }

        AgentResponseHandler.registerMessageListener("cli", async (message: string) => {
            console.log(`Agent Response: ${message}`);
        });

        AgentResponseHandler.registerStatusListener("cli", async (event: { type: string; payload?: unknown }) => {
            console.log(`Agent Status Update: ${JSON.stringify(event)}`);
        });

        AgentResponseHandler.registerArtifactListener("cli", async (filePath: string, chatId: string, mime_type: string, description?: string | undefined) => {
            console.log(`Agent Artifact Received: ${filePath} for chatId: ${chatId} with mime_type: ${mime_type} and description: ${description}`);
        });

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        let query = null;
        while (query !== "exit") {
            if (query) {
                await signalWithStartAgentWorkflow(query);
            }

            query = await rl.question("Input: ");
            if (query === "exit") {
                console.log("Exiting...");
                break;
            }
        }

        rl.close();
        process.exit(0);
    }
}

async function signalWithStartAgentWorkflow(input: string): Promise<void> {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: await createWorkflowId("cli", "cli"),
        args: [{}],
        signal: agentWorkflowMessageSignal,
        signalArgs: [input, "User", new Date().toISOString()],
    });
}

CommandLineInstance.run().catch((error) => {
    console.error("Error in CommandLineInstance:", error);
    process.exit(1);
});
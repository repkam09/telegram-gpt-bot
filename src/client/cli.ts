import readline from "node:readline/promises";
import { Config } from "../singletons/config";
import { createTemporalClient } from "../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal } from "../temporal/workflows";
import { AgentResponseHandler, createWorkflowId } from "../temporal/agent/interface";

export class CommandLineInstance {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            console.error("CommandLineInstance can only be used in development mode.");
            throw new Error("CommandLineInstance should not be used in production mode.");
        }

        AgentResponseHandler.registerListener("cli", async (message: string) => {
            console.log(`Agent Response: ${message}`);
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
        workflowId: createWorkflowId("cli", "cli"),
        args: [{}],
        signal: agentWorkflowMessageSignal,
        signalArgs: [input, "User", new Date().toISOString()],
    });
}

CommandLineInstance.run().catch((error) => {
    console.error("Error in CommandLineInstance:", error);
    process.exit(1);
});
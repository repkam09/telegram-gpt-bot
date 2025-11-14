import readline from "node:readline/promises";
import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/consumer";
import { createAdminUser, createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowExitSignal, agentWorkflowMessageSignal } from "../temporal/workflows";
import { EventManager } from "../events/events";
import { WorkflowHandle } from "@temporalio/client";

export class AgenticCommandLineInstance {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            throw new Error("AgenticCommandLineInstance should not be used in production mode.");
        }

        const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (!user) {
            throw new Error("Existing admin user account not found");
        }

        const workflowId = `cli:${user.chatId}`;
        const client = await createTemporalClient();

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const emitter = EventManager.getInstance();
        emitter.createEventEmitter(workflowId);

        emitter.subscribe<string>(workflowId, "agentWorkflowMessageBroadcast", async (response: string) => {
            console.log("\n\n=====\n" + response + "\n=====\n\n");
        });

        try {
            await client.workflow.start(agentWorkflow, {
                taskQueue: Config.TEMPORAL_TASK_QUEUE,
                workflowId: workflowId,
                args: [{
                    user: createAdminUser(`${user.chatId}`, user.displayName),
                    aggressiveContinueAsNew: false,
                }]
            });
        } catch {
            // already running, probably
        }

        const handle: WorkflowHandle<typeof agentWorkflow> = client.workflow.getHandle(workflowId);

        let query = null;
        while (query !== "/exit") {
            if (query) {
                await handle.signal(agentWorkflowMessageSignal, query, new Date().toISOString());
            }

            query = await rl.question("Input: ");
            if (query === "/exit") {
                console.log("Exiting...");
                await handle.signal(agentWorkflowExitSignal);
                break;
            }
        }

        rl.close();
        process.exit(0);
    }
}
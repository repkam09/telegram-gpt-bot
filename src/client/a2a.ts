import { AgentCard, Message } from "@a2a-js/sdk";
import { agentCardHandler, restHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import {
    AgentExecutor,
    RequestContext,
    ExecutionEventBus,
    DefaultRequestHandler,
    InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import { Logger } from "../singletons/logger";

export class Agent2AgentProtocolServer {
    private static _requestHandler: DefaultRequestHandler;

    public static async init() {
        Logger.info(undefined, "Initializing Agent2Agent Protocol Server...");
        // The actual server is created in the WebhookInstance when the Express app is initialized.
    }

    public static card(): AgentCard {
        return {
            name: "Hennos Agent",
            description: "An AI agent that can chat and perform tasks on behalf of the user.",
            protocolVersion: "0.3.0",
            version: "1.0.0",
            url: `${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/a2a/rest`, // This should be the URL where the REST handler is exposed
            skills: [{ id: "chat", name: "Chat", description: "Chat with the agent", tags: ["chat"] }],
            capabilities: {
                pushNotifications: false,
            },
            defaultInputModes: ["text"],
            defaultOutputModes: ["text"],
            additionalInterfaces: [
                { url: `${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/a2a/rest`, transport: "HTTP+JSON" },
            ],
        };
    }

    public static requestHandler() {
        if (!Agent2AgentProtocolServer._requestHandler) {
            const agentExecutor = new HennosExecutor();
            const requestHandler = new DefaultRequestHandler(
                Agent2AgentProtocolServer.card(),
                new InMemoryTaskStore(),
                agentExecutor
            );
            Agent2AgentProtocolServer._requestHandler = requestHandler;
        }

        return Agent2AgentProtocolServer._requestHandler;

    }

    public static agentCardHandler() {
        return agentCardHandler({ agentCardProvider: Agent2AgentProtocolServer.requestHandler() });
    }

    public static agentRestHandler() {
        return restHandler({ requestHandler: Agent2AgentProtocolServer.requestHandler(), userBuilder: UserBuilder.noAuthentication });
    }
}

class HennosExecutor implements AgentExecutor {
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        // TODO: Create the interaction with Hennos Agent
        const responseMessage: Message = {
            kind: "message",
            messageId: randomUUID(),
            role: "agent",
            parts: [{ kind: "text", text: "Hello!" }],
            contextId: requestContext.contextId,
        };

        eventBus.publish(responseMessage);
        eventBus.finished();
    }

    // cancelTask is not needed for this simple, non-stateful agent.
    cancelTask = async (): Promise<void> => { };
}
import { Express } from "express";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { Agent2AgentProtocolServer } from "../a2a";

export class A2AWebhookInstance {
    public static init(app: Express) {
        app.use(`/${AGENT_CARD_PATH}`, Agent2AgentProtocolServer.agentCardHandler());
        app.use("/a2a/rest", Agent2AgentProtocolServer.agentRestHandler());
    }
}
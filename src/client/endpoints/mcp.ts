import { Express } from "express";
import { ModelContextProtocolServer } from "../mcp";

export class MCPWebhookInstance {
    public static init(app: Express) {
        app.post("/hennos/mcp", ModelContextProtocolServer.middleware());
        app.get("/hennos/mcp", ModelContextProtocolServer.handleSessionRequest());
        app.delete("/hennos/mcp", ModelContextProtocolServer.handleSessionRequest());
    }
}
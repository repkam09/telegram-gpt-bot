import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";
import { TransmissionWrapper } from "../singletons/transmission";

export class TransmissionActive extends BaseTool {
    public static functionName() {
        return "transmission_active";
    }

    public static isEnabled(): boolean {
        if (Config.TRANSMISSION_ENABLED) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            "type": "function",
            "function": {
                "name": this.functionName(),
                "description": [
                    "This tool uses the Transmission RPC to retrieve the list of active downloads."
                ].join(" "),
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        this.start(req, args);
        try {
            const active = await TransmissionWrapper.getActive() as unknown as TransmissionActiveResult[];
            const result = active.map((torrent) => {
                torrent.torrents = torrent.torrents.map((t) => {
                    return {
                        ...t,
                        peers: undefined,
                        trackerStats: undefined,
                        trackers: undefined,
                        files: undefined
                    };
                });

                return torrent;
            });

            return this.success(req, JSON.stringify(result), metadata);
        } catch (err: unknown) {
            return this.error(req, "Unable to fetch active torrents.", err as Error, metadata);
        }
    }
}

type TransmissionActiveResult = {
    removed: any[]
    torrents: any[]
}
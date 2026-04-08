import { RealtimeFunctionTool } from "openai/resources/realtime/realtime";
import { Logger } from "../singletons/logger";
import { BraveSearch } from "../tools/BraveSearch";

export class RealtimeBraveSearch {
    public static definition(): RealtimeFunctionTool {
        return {
            type: "function",
            name: "brave_search",
            description: BraveSearch.definition().function.description,
            parameters: BraveSearch.definition().function.parameters,
        };
    }

    public static async callback(
        workflowId: string,
        args: Record<string, string>
    ): Promise<object> {
        Logger.info(
            workflowId,
            `Brave callback, query=${args.query}, resource=${args.resource}`
        );
        if (!args.query) {
            return {
                error: "brave_search, missing required parameter 'query'",
            };
        }

        const resource = args.resource || "web";
        if (!["web", "images", "news", "videos"].includes(resource)) {
            return {
                error: `brave_search, invalid resource '${resource}' provided. Expected one of: web, images, news, videos`,
            };
        }

        try {
            const body = await BraveSearch.searchResults({
                query: args.query,
                resource: resource,
            });
            return { results: body };
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(`Error fetching Brave search results: ${error.message}`);
            return {
                error: `brave_search, failed to fetch search results: ${error.message}`,
            };
        }
    }
}

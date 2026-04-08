import { RealtimeFunctionTool } from "openai/resources/realtime/realtime";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "../tools/OpenWeatherMapLookupTool";
import { ToolCallFunctionArgs } from "../tools/BaseTool";

export class RealtimeWeatherLookup {
    public static definition(): RealtimeFunctionTool {
        return {
            type: "function",
            name: "open_weather_map_lookup",
            description:
                OpenWeatherMapLookupTool.definition().function.description,
            parameters: OpenWeatherMapLookupTool.definition().function.parameters,
        };
    }

    public static async callback(
        workflowId: string,
        args: ToolCallFunctionArgs
    ): Promise<object> {
        try {
            if (!args.lat) {
                return { error: "open_weather_map_lookup, missing required parameter 'lat'" };
            }

            if (!args.lon) {
                return { error: "open_weather_map_lookup, missing required parameter 'lon'" };
            }

            const body = await OpenWeatherMapLookupTool.fetchWeatherData(workflowId, args.lat, args.lon, args.units, args.mode);
            return { results: body };
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(`Error fetching weather data: ${error.message}`);
            return {
                error: `open_weather_map_lookup, failed to fetch weather data: ${error.message}`,
            };
        }
    }
}

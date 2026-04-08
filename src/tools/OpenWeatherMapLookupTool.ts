/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class OpenWeatherMapLookupTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.OPEN_WEATHER_API) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "open_weather_map_lookup",
                description: [
                    "This tool utilizes the Open Weather Map API to provide weather reports for specific locations.",
                    "To use this tool, you must supply the latitude and longitude coordinates of the desired location.",
                    "Returns detailed weather information, including temperature, feels like temperature, minimum and maximum temperatures, atmospheric pressure, humidity, wind speed, and a brief description of the weather (e.g., 'clear sky', 'few clouds')."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        mode: {
                            type: "string",
                            "description": "Determines the type of weather data to retrieve. Choose 'current' for present conditions or 'forecast' for future predictions. Defaults to 'current'."
                        },
                        lat: {
                            type: "number",
                            "description": "Latitude of the location for which the weather report is requested."
                        },
                        lon: {
                            type: "number",
                            "description": "Longitude of the location for which the weather report is requested."
                        },
                        units: {
                            type: "string",
                            "description": "Selects the units of measurement. Available options are 'metric' or 'imperial'. Default is 'metric'."
                        }
                    },
                    required: ["lat", "lon"],
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.lat) {
            return [JSON.stringify({ error: "lat not provided" }), metadata];
        }

        if (!args.lon) {
            return [JSON.stringify({ error: "lon not provided" }), metadata];
        }

        try {
            const weather = await OpenWeatherMapLookupTool.fetchWeatherData(workflowId, args.lat, args.lon, args.units, args.mode);
            return [`${JSON.stringify(weather)}`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `open_weathermap_lookup_tool_callback error. ${JSON.stringify({ lat: args.lat, lon: args.lon, error: error.message })}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }

    public static async fetchWeatherData(workflowId: string, lat: number, lon: number, units?: string, mode?: string): Promise<object> {
        Logger.info(workflowId, `open_weathermap_lookup_tool_callback. ${JSON.stringify({ lat, lon, units, mode })}`);
        const _units = units ?? "metric";
        const _mode = mode ?? "current";

        if (_mode === "current") {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${_units}&appid=${Config.OPEN_WEATHER_API}`;
            const weather = await BaseTool.fetchJSONData(url);
            return weather;
        }

        if (_mode === "forecast") {
            const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${_units}&appid=${Config.OPEN_WEATHER_API}`;
            const weather = await BaseTool.fetchJSONData(url);
            return weather;
        }

        throw new Error(`Unknown mode '${_mode}' was specified`);
    }
}

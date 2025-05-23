/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { HennosConsumer } from "../singletons/base";
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

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.lat) {
            return ["open_weather_map_lookup error, lat not provided", metadata];
        }

        if (!args.lon) {
            return ["open_weather_map_lookup error, lon not provided", metadata];
        }

        const units = args.units ?? "metric";
        const mode = args.mode ?? "current";

        Logger.info(req, "open_weathermap_lookup_tool_callback", { lat: args.lat, lon: args.lon, units: units, mode: mode });
        try {
            if (mode === "current") {
                const url = `https://api.openweathermap.org/data/2.5/weather?lat=${args.lat}&lon=${args.lon}&units=${units}&appid=${Config.OPEN_WEATHER_API}`;
                const weather = await BaseTool.fetchJSONData(url);
                return [`Here is the weather report generated by the Open Weathermap API for the location lat=${args.lat} lon=${args.lon} using ${units} units: ${JSON.stringify(weather)}`, metadata];
            }

            if (mode === "forecast") {
                const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${args.lat}&lon=${args.lon}&units=${units}&appid=${Config.OPEN_WEATHER_API}`;
                const weather = await BaseTool.fetchJSONData(url);
                return [`Here is the weather forecast generated by the Open Weathermap API for the location lat=${args.lat} lon=${args.lon} using ${units} units: ${JSON.stringify(weather)}`, metadata];
            }

            Logger.warn(req, "open_weathermap_lookup_tool_callback unknown mode", { lat: args.lat, lon: args.lon, units: units, mode: mode });
            return [`open_weather_map_lookup error, unknown mode '${mode}' was specified`, metadata];
        } catch (err) {
            Logger.error(req, "open_weathermap_lookup_tool_callback error", { lat: args.lat, lon: args.lon, error: err });
            return [`open_weather_map_lookup error, unable to fetch weather data for lat=${args.lat} lon=${args.lon}`, metadata];
        }
    }
}

import { FuncParams, Functions } from "../singletons/functions";
import { formatErrorResponse, formatResponse, fetch } from "./common";

export default function init() {
    Functions.register({
        name: "get_current_weather_zip",
        description: "Get the current weather by zip code",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "The zip code"
                },
            },
            required: [
                "location"
            ]
        }
    }, get_current_weather_zip);

    Functions.register({
        name: "get_forecast_weather_zip",
        description: "Get the weather forecast by zip code",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "The zip code"
                },
            },
            required: [
                "location"
            ]
        }
    }, get_forecast_weather_zip );
}

async function get_forecast_weather_zip(chatId: number, options: FuncParams) {
    const data = await fetch("https://api.repkam09.com/api/weather/forecast/zip/" + options.location);
    if (!data) {
        return formatErrorResponse(options, `Unable to get weather forecast information for: ${options.location}`);
    }
    return formatResponse(options, `Weather forecast information for: ${options.location}`, data);
}

async function get_current_weather_zip(chatId: number, options: FuncParams) {
    const data = await fetch("https://api.repkam09.com/api/weather/current/zip/" + options.location);
    if (!data) {
        return formatErrorResponse(options, `Unable to get weather information for: ${options.location}`);
    }
    return formatResponse(options, `Weather information for: ${options.location}`, data);
}
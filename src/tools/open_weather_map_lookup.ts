/* eslint-disable @typescript-eslint/no-non-null-assertion */
import OpenAI from "openai";
import { HennosConsumer } from "../singletons/base";
import { Message } from "ollama";
import { Logger } from "../singletons/logger";
import { ToolEntries } from "./tools";
import { getHTMLSearchResults } from "./duck_duck_go_search";
import { Config } from "../singletons/config";

export const open_weathermap_lookup_tool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: "function",
    function: {
        name: "open_weather_map_lookup",
        description: "Fetch real time weather information from OpenWeather",
        parameters: {
            type: "object",
            properties: {
                lat: {
                    type: "number",
                    description: "The location latitude.",
                },
                lon: {
                    type: "number",
                    description: "The location longitude.",
                },
            },
            required: ["lat", "lon"],
        }
    }
};

export type OpenWeatherMapToolArgs = {
    lat: string,
    lon: string
};

export const open_weathermap_lookup_tool_callback = async (req: HennosConsumer, tool_entry: ToolEntries<OpenWeatherMapToolArgs>): Promise<Message | undefined> => {
    if (!tool_entry.args.lat) {
        return undefined;
    }

    if (!tool_entry.args.lon) {
        return undefined;
    }

    if (!Config.OPEN_WEATHER_API) {
        return undefined;
    }

    Logger.info(req, "open_weathermap_lookup_tool_callback", { lat: tool_entry.args.lat, lon: tool_entry.args.lon });
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${tool_entry.args.lat}&lon=${tool_entry.args.lon}&units=imperial&appid=${Config.OPEN_WEATHER_API}`;
        const weather = await getHTMLSearchResults(url);
        return {
            content: `Here is the current weather report for the location lat=${tool_entry.args.lat} lon=${tool_entry.args.lon} using imperial units. Provided by the Open Weathermap API for your reference: ${weather}`,
            role: "system"
        };
    } catch (err) {
        return undefined;
    }

};
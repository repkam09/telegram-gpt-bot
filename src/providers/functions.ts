import { ChatCompletionFunctions, ChatCompletionRequestMessageFunctionCall } from "openai";
import { processImageGeneration } from "../handlers/text/common";
import axios from "axios";

/**
 * This function should take the incoming call, run it, and provide the data back to the context
 * the triggering the processChatCompletion again.
 * 
 * @param chatId 
 * @param data 
 */
export async function handleFunctionCall(chatId: number, data: ChatCompletionRequestMessageFunctionCall): Promise<string> {
    if (!data.arguments) {
        data.arguments = JSON.stringify({});
    }

    const args = JSON.parse(data.arguments);
    switch (data.name) {
    case "get_current_weather_zip": {
        return get_current_weather_zip(chatId, args);
    }

    case "get_forecast_weather_zip": {
        return get_forecast_weather_zip(chatId, args);
    }

    case "generate_image": {
        return generate_image(chatId, args);
    }

    default: {
        return `Unknown Function: ${data.name}`;
    }
    }
}

async function fetch(url: string): Promise<string | undefined> {
    try {
        const data = await axios.get(url);

        if (typeof data.data === "string") {
            return data.data;
        }

        return JSON.stringify(data.data);
    } catch (err: unknown) {
        return undefined;
    }
}

async function get_current_weather_zip(chatId: number, options: any) {
    const data = await fetch("https://api.repkam09.com/api/weather/current/zip/" + options.location);
    if (!data) {
        return JSON.stringify({
            error: true,
            message: `Unable to get weather information for: ${options.location}`,
        });
    }
    return data;
}

async function get_forecast_weather_zip(chatId: number, options: any) {
    const data = await fetch("https://api.repkam09.com/api/weather/forecast/zip/" + options.location);
    if (!data) {
        return JSON.stringify({
            error: true,
            message: `Unable to get weather information for: ${options.location}`,
        });
    }
    return data;
}

async function generate_image(chatId: number, options: any) {
    const result = await processImageGeneration(chatId, options.prompt);
    if (!result) {
        return JSON.stringify({
            error: true,
            message: `Unable to generate image for prompt: ${options.prompt}`,
            generate_image_url: undefined
        });
    }

    return JSON.stringify({
        error: false,
        generate_image_url: result
    });
}


export function buildFunctionsArray(): ChatCompletionFunctions[] {
    return [
        {
            "name": "get_current_weather_zip",
            "description": "Get the current weather by zip code",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The zip code"
                    },
                },
                "required": [
                    "location"
                ]
            }
        },
        {
            "name": "generate_image",
            "description": "Generate an image based on the users input",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The prompt to feed into DALL-E"
                    }
                },
                "required": [
                    "prompt"
                ]
            }
        }
    ];
}

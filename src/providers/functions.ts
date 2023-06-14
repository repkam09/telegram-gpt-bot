import { processImageGeneration } from "../handlers/text/common";
import axios from "axios";
import { Functions } from "../singletons/functions";

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

export function init() {
    // Dummy function to load in this file
}

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
}, async (chatId: number, options: any) => {
    const data = await fetch("https://api.repkam09.com/api/weather/current/zip/" + options.location);
    if (!data) {
        return JSON.stringify({
            error: true,
            message: `Unable to get weather information for: ${options.location}`,
        });
    }
    return data;
});

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
}, async (chatId: number, options: any) => {
    const data = await fetch("https://api.repkam09.com/api/weather/forecast/zip/" + options.location);
    if (!data) {
        return JSON.stringify({
            error: true,
            message: `Unable to get weather information for: ${options.location}`,
        });
    }
    return data;
});

Functions.skip_register({
    name: "generate_image",
    description: "Create, generate, or draw an image using the OpenAI DALL·E API based on a given prompt",
    parameters: {
        type: "object",
        properties: {
            prompt: {
                type: "string",
                description: "A string that describes the image, drawing, picture or similar that should be generated"
            },
        },
        required: [
            "prompt"
        ]
    }
}, async (chatId: number, options: any) => {
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
});

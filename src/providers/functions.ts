import { processImageGeneration } from "../handlers/text/common";
import axios from "axios";
import { Functions, FuncParams } from "../singletons/functions";
import { Schedule } from "../singletons/schedule";
import { BotInstance } from "../singletons/telegram";

async function fetch(url: string): Promise<unknown | undefined> {
    try {
        const data = await axios.get(url);
        return data.data as unknown;
    } catch (err: unknown) {
        return undefined;
    }
}

function formatResponse(input: FuncParams, message: string, data: unknown,) {
    return JSON.stringify({
        error: false,
        message,
        data,
        input
    });
}

function formatErrorResponse(input: FuncParams, message: string) {
    return JSON.stringify({
        error: true,
        message,
        data: undefined,
        input
    });
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
}, async (chatId: number, options: FuncParams) => {
    const data = await fetch("https://api.repkam09.com/api/weather/current/zip/" + options.location);
    if (!data) {
        return formatErrorResponse(options, `Unable to get weather information for: ${options.location}`);
    }
    return formatResponse(options, `Weather information for: ${options.location}`, data);
});

Functions.register({
    name: "set_reminder_at_date_time",
    description: "Sets up a reminder to message the user at a specific time and date",
    parameters: {
        type: "object",
        properties: {
            date: {
                type: "string",
                format: "date",
                description: "The date to set the reminder for. Eg, 2018-11-13"
            },
            time: {
                type: "string",
                format: "time",
                description: "The time, in UTC, to set the reminder for. Eg, 20:20:39+00:00"
            },
            message: {
                type: "string",
                description: "The message to send the user when the reminder triggers"
            },
        },
        required: [
            "date",
            "time",
            "message",
        ]
    }
}, async (chatId: number, options: FuncParams) => {
    const trigger = new Date(`${options.date}${options.time}`);
    Schedule.register(trigger, async () => {
        BotInstance.instance().sendMessage(chatId, options.message);
    });

    return formatResponse(options, `Your reminder for ${options.message} has been set for ${options.date} at ${options.time}`, "");
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
}, async (chatId: number, options: FuncParams) => {
    const data = await fetch("https://api.repkam09.com/api/weather/forecast/zip/" + options.location);
    if (!data) {
        return formatErrorResponse(options, `Unable to get weather forecast information for: ${options.location}`);
    }
    return formatResponse(options, `Weather forecast information for: ${options.location}`, data);
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
}, async (chatId: number, options: FuncParams) => {
    const result = await processImageGeneration(chatId, options.prompt);
    if (!result) {
        return formatErrorResponse(options, `Unable to generate image for prompt: ${options.prompt}`);
    }

    return formatResponse(options, `Generated image for prompt: ${options.prompt}`, result);
});

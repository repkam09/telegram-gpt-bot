import { Config } from "../singletons/config";
import { FuncParams, Functions } from "../singletons/functions";
import { formatErrorResponse, formatResponse, fetch } from "./common";

export default function init() {
    Functions.register({
        name: "get_youtube_video_info",
        description: "This function will fetch basic information about a YouTube Video, by ID, from the YouTube v3 API",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: "The YouTube Video ID. Eg. 'oc6RV5c1yd' from the URL 'https://www.youtube.com/watch?v=oc6RV5c1yd0' or 'https://youtu.be/oc6RV5c1yd0'"
                },
            },
            required: [
                "id"
            ]
        }
    }, get_youtube_video_info);

    Functions.skip_register({
        name: "get_youtube_video_transcription",
        description: "This function will fetch a complete transcription from a YouTube Video, by ID, from the YouTube v3 API",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: "The YouTube Video ID. Eg. 'oc6RV5c1yd' from the URL 'https://www.youtube.com/watch?v=oc6RV5c1yd0' or 'https://youtu.be/oc6RV5c1yd0'"
                },
            },
            required: [
                "id"
            ]
        }
    }, get_youtube_video_transcription);
}

async function get_youtube_video_info(chatId: number, options: FuncParams) {
    if (!Config.GOOGLE_API_KEY) {
        return formatErrorResponse(options, `Unable to get video information for: ${options.id}`);
    }

    const url = buildURL(`videos?part=id&part=topicDetails&part=snippet&id=${options.id}`);
    const data = await fetch(url);
    if (!data) {
        return formatErrorResponse(options, `Unable to get video information for: ${options.id}`);
    }
    return formatResponse(options, `Video information for id: ${options.id}`, data);
}

async function get_youtube_video_transcription(chatId: number, options: FuncParams) {
    if (!Config.GOOGLE_API_KEY) {
        return formatErrorResponse(options, `Unable to get video information for: ${options.id}`);
    }

    const url = buildURL(`captions/${options.id}?tfmt=srt&tlang=en`);
    const data = await fetch(url);
    if (!data) {
        return formatErrorResponse(options, `Unable to get video transcription for: ${options.id}`);
    }
    return formatResponse(options, `Video transcription for id: ${options.id}`, data);
}

function buildURL(request: string): string {
    return `https://youtube.googleapis.com/youtube/v3/${request}&key=${Config.GOOGLE_API_KEY}`;
}

import axios from "axios";
import { Config } from "../singletons/config";
import { NotImplementedError } from "../utils";

export async function getVideoInfo(chatId: number, videoId: string): Promise<string> {
    const url = `https://youtube.googleapis.com/youtube/v3/videos?part=id&part=topicDetails&part=snippet&id=${videoId}&key=${Config.GOOGLE_API_KEY}`;
    const result = await axios.get(url, {
        headers: {
            "Accept": "application/json"
        }
    });

    const data = result.data.items[0];

    if (data.thumbnails) {
        delete data.thumbnails;
    }

    if (data.localized) {
        delete data.localized;
    }

    if (data.etag) {
        delete data.etag;
    }

    if (data.categoryId) {
        delete data.categoryId;
    }

    return `Summarize, in a few short paragraphs using Markdown, this information provided by the YouTube v3 API from Google: ${JSON.stringify(data)}`;
}

export async function downloadYouTubeVideo(chatId: number, videoId: string) {
    throw new NotImplementedError(chatId, videoId);
}

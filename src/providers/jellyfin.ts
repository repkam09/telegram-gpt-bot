import { FuncParams, Functions } from "../singletons/functions";
import { formatErrorResponse, formatResponse, fetch } from "./common";
import { Config } from "../singletons/config";


export default function init() {
    Functions.register({
        name: "get_latest_jellyfin_shows",
        description: "Gets the latest shows available on Jellyfin",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }, get_latest_jellyfin_shows);

    Functions.register({
        name: "get_latest_jellyfin_movies",
        description: "Gets the latest movies available on Jellyfin",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }, get_latest_jellyfin_movies);
}

const headers = {
    Authorization: `MediaBrowser Token="${Config.JELLYFIN_API_KEY}"`
};

async function get_latest_jellyfin_shows(chatId: number, options: FuncParams) {
    const data = await fetch(`${Config.JELLYFIN_SERVER_URL}/Users/${Config.JELLYFIN_USER_ID}/Items/Latest?includeItemTypes=Episode&fields=Name,SeriesName,SeasonName&enableUserData=false&enableImages=false`, headers);
    if (!data) {
        return formatErrorResponse(options, "Unable to get show information from Jellyfin");
    }

    if (!Array.isArray(data)) {
        return formatErrorResponse(options, "Unable to get show information from Jellyfin");
    }

    const parsed = data.map(({ Name, SeriesName, SeasonName}) => {
        return { Name, SeriesName, SeasonName };
    });

    return formatResponse(options, "Latest show information from Jellyfin", parsed);
}

async function get_latest_jellyfin_movies(chatId: number, options: FuncParams) {
    const data = await fetch(`${Config.JELLYFIN_SERVER_URL}/Users/${Config.JELLYFIN_USER_ID}/Items/Latest?includeItemTypes=Movie&fields=Name,ProductionYear&enableUserData=false&enableImages=false`, headers);
    if (!data) {
        return formatErrorResponse(options, "Unable to get movie information from Jellyfin");
    }
    
    if (!Array.isArray(data)) {
        return formatErrorResponse(options, "Unable to get movie information from Jellyfin");
    }

    const parsed = data.map(({ Name, ProductionYear}) => {
        return { Name, ProductionYear };
    });

    return formatResponse(options, "Latest movie information from Jellyfin", parsed);
}
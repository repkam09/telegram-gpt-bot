import fs from "node:fs/promises";
import path from "node:path";
import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { Config } from "../singletons/config";
import ical from "node-ical";

export class UserImportantFacts extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "user_important_facts",
                description: [
                    "This tool is used to set important facts about a user. This can be helpful for keeping long term information about the user that can help with future interactions.",
                    "This data is stored as a key-value pair and can be overwritten by later calls to this function.",
                    "Make sure to use a descriptive key to help identify the fact later. A list of available keys will be included in the chat context."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "The key to store the value under.",
                        },
                        value: {
                            type: "string",
                            description: "The value to store for the key.",
                        }
                    },
                    required: ["key", "value"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "UserImportantFacts callback", { url: args.url });
        if (!args.url) {
            return ["ics_calendar_import, url not provided", metadata];
        }

        try {
            const binary = await BaseTool.fetchBinaryData(args.url);
            const calendarFilePath = path.join(Config.LOCAL_STORAGE(req), "calendar.ics");
            await fs.writeFile(calendarFilePath, binary);

            const result = await handleCalendarImport(req, calendarFilePath);
            if (result.length > 0) {
                Logger.info(req, "ImportCalendar imported successfully", { result: result.length });
                return [`ics_calendar_import, imported successfully, here are the most recent ${result.length} events: ${JSON.stringify(result)}`, metadata];
            } else {
                Logger.info(req, "ImportCalendar imported zero events", { result: result.length });
                return ["ics_calendar_import, imported successfully but returned zero events", metadata];
            }
        } catch (err) {
            const error = err as Error;
            Logger.error(req, "ImportCalendar unable to process url", { url: args.url, err: error.message });
            return ["ics_calendar_import, unable to import provided url", metadata];
        }
    }
}


export async function handleCalendarImport(req: HennosConsumer, file: string): Promise<CalendarEvent[]> {
    Logger.debug("handleCalendarImport", { file });
    const events = ical.sync.parseFile(file);

    const result: CalendarEvent[] = [];
    for (const event of Object.values(events)) {
        if (event.type === "VEVENT") {
            Logger.debug("handleCalendarImport, VEVENT", { summary: event.summary });
            result.push({
                summary: event.summary,
                description: event.description,
                start: event.start,
                end: event.end,
                location: event.location
            });
        } else {
            Logger.debug("handleCalendarImport, skipping non-VEVENT", { type: event.type });
        }
    }

    const cleaned = result.reverse().slice(0, 10);
    Logger.debug("handleCalendarImport, cleaned", { count: cleaned.length });
    return cleaned;
}

type CalendarEvent = {
    summary: string,
    description: string,
    start: Date,
    end: Date,
    location: string
}
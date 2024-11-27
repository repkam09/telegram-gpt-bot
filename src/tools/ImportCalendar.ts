import fs from "node:fs/promises";
import path from "node:path";
import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import ical from "node-ical";

export class ImportCalendar extends BaseTool {
    public static functionName(): string {
        return "ics_calendar_import";
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: this.functionName(),
                description: [
                    "This tool imports an ICS calendar file into the Hennos system using a provided URL.",
                    "It parses the calendar and returns the next 10 upcoming events for easy access and review."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL of the ICS calendar file to be imported."
                        }
                    },
                    required: ["url"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        this.start(req, args);
        if (!args.url) {
            return this.error(req, "required parameter 'url' not provided", new Error("Invalid ToolCallFunctionArgs"), metadata);
        }

        try {
            const binary = await BaseTool.fetchBinaryData(args.url);
            const calendarFilePath = path.join(Config.LOCAL_STORAGE(req), "calendar.ics");
            await fs.writeFile(calendarFilePath, binary);

            const result = await handleCalendarImport(req, calendarFilePath);
            return this.success(req, `Succesfully imported calendar. Found ${result.length} events: ${JSON.stringify(result)}`, metadata);
        } catch (err) {
            return this.error(req, "Unable to import calendar from provided URL.", err as Error, metadata);
        }
    }
}

export async function handleCalendarImport(req: HennosConsumer, file: string): Promise<CalendarEvent[]> {
    Logger.debug(req, "handleCalendarImport", { file });
    const events = ical.sync.parseFile(file);

    const result: CalendarEvent[] = [];
    for (const event of Object.values(events)) {
        if (event.type === "VEVENT") {
            Logger.debug(req, "handleCalendarImport, VEVENT", { summary: event.summary });
            result.push({
                summary: event.summary,
                description: event.description,
                start: event.start,
                end: event.end,
                location: event.location
            });
        } else {
            Logger.debug(req, "handleCalendarImport, skipping non-VEVENT", { type: event.type });
        }
    }

    const cleaned = result.reverse().slice(0, 10);
    Logger.debug(req, "handleCalendarImport, cleaned", { count: cleaned.length });
    return cleaned;
}

type CalendarEvent = {
    summary: string,
    description: string,
    start: Date,
    end: Date,
    location: string
}
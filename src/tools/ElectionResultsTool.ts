/* eslint-disable @typescript-eslint/no-explicit-any */
import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";

export class ElectionResultsTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.THE_NEWS_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "election_results",
                description: [
                    "This tool retrieves the latest information for the 2024 presidential election.",
                    "The election takes place on Nov 5th, 2024. This tool provides a state-by-state breakdown with the following information: ",
                    "electoralVotes, raceName, percentIn, winner, pollsClosed, isKeyRace, stateCode, votingToday, candidates[{name, party, isIncumbent, isWinner, votes, electoralVotes, percentVote, formattedPercentVote}]",
                    "If a user asks about the 2024 presidential election, use this tool to get the latest information."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        states: {
                            type: "string",
                            description: "A comma-seperated list of state codes, NY, CA, etc to retrieve election results for. If this is not provided, all states will be returned. Ex: 'NY,CA'",
                        }
                    },
                    required: [],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "election_results_callback", { states: args.states });

        try {
            const result = await BaseTool.fetchJSONData("https://www.nbcnews.com/firecracker/api/v2/national-results/2024-elections/president-results");
            const states = args.states ? args.states.split(",").map((state: string) => state.trim()) : [];

            const allstates = Object.keys(result.mapData);
            const mapData = allstates.reduce((acc: any, state: string) => {
                if (states.length === 0 || states.includes(state)) {
                    const stateData = result.mapData[state];
                    acc[state] = {
                        "electoralVotes": stateData.tooltip.electoralVotes,
                        "raceName": stateData.tooltip.raceName,
                        "percentIn": stateData.tooltip.percentIn,
                        "winner": stateData.winner,
                        "pollsClosed": stateData.pollsClosed,
                        "isKeyRace": stateData.isKeyRace,
                        "stateCode": stateData.stateCode,
                        "votingToday": stateData.votingToday,
                        candidates: stateData.tooltip.candidates.map((candidate: any) => {
                            return {
                                "name": candidate.name,
                                "party": candidate.party,
                                "isIncumbent": candidate.isIncumbent,
                                "isWinner": candidate.isWinner,
                                "votes": candidate.votes,
                                "electoralVotes": candidate.electoralVotes,
                                "percentVote": candidate.percentVote,
                                "formattedPercentVote": candidate.formattedPercentVote
                            };
                        }),
                    };
                }
                return acc;
            }, {});

            const bopDataBar = result.bopData.bar;

            const response = {
                "electionType": "general",
                "electionSeason": "2024",
                "office": "president",
                "electionDate": result.electionDate,
                "lastModified": result.lastModified,
                "lastModifiedFormatted": result.lastModifiedFormatted,
                states: mapData,
                national: {
                    dem: {
                        "name": bopDataBar.dem.name,
                        total: bopDataBar.dem.total,
                        isWinner: bopDataBar.dem.isWinner,
                    },
                    rep: {
                        "name": bopDataBar.rep.name,
                        total: bopDataBar.rep.total,
                        isWinner: bopDataBar.rep.isWinner,
                    }
                }
            };

            return [`election_results: ${JSON.stringify(response)}.`, metadata];

        } catch (err) {
            const error = err as Error;
            Logger.error(req, "election_results error", { states: args.states, error: error.message });
            return ["election_results error, unable to process election results at this time", metadata];
        }
    }
}
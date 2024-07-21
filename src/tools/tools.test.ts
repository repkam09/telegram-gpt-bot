import { HennosUser } from "../singletons/user";
import { determine_tool_calls_needed, ToolEntries } from "../tools/tools";

describe("determine_tool_calls_needed", () => {
    beforeAll(() => {
        process.env.HENNOS_DEVELOPMENT_MODE = "true";
        process.env.HENNOS_VERBOSE_LOGGING = "true";
    });

    it("should determine that weather is needed", async () => {
        const user = new HennosUser(-1);

        const result = await determine_tool_calls_needed(user, [{
            content: "What is the weather today in Rochester, NY?",
            role: "user"
        }]);

        expect(result).toStrictEqual(expect.arrayContaining<ToolEntries>([
            {
                name: "open_weather_map_lookup",
                args: expect.anything()
            }
        ]));
    });

    it("should determine that a web search is needed", async () => {
        const user = new HennosUser(-1);

        const result = await determine_tool_calls_needed(user, [{
            content: "What is the latest in world news?",
            role: "user"
        }]);

        expect(result).toStrictEqual(expect.arrayContaining<ToolEntries>([
            {
                name: "duck_duck_go_search",
                args: expect.anything()
            }
        ]));
    });
});
import { open_weathermap_lookup_tool_callback } from "./open_weather_map_lookup";
import { HennosUser } from "../singletons/user";

describe("open_weathermap_lookup_tool_callback", () => {
    beforeAll(() => {
        process.env.HENNOS_DEVELOPMENT_MODE = "true";
        process.env.HENNOS_VERBOSE_LOGGING = "true";
    });

    it("feather weather from lat lon", async () => {
        const user = new HennosUser(-1);
        const result = await open_weathermap_lookup_tool_callback(user, {
            name: "open_weather_map_lookup",
            args: {
                lat: "43.1566",
                lon: "-77.6088"
            }
        });
        expect(result).toBeTruthy();
    });
});
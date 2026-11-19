import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastActiveDateString, temporalGrounding } from "./grounding";

describe("temporalGrounding", () => {
    it("returns the ISO date and the weekday name", () => {
        // 2026-11-18 is a Wednesday. Use local noon so the result is stable across time zones.
        const { date, day } = temporalGrounding(new Date(2026, 10, 18, 12, 0, 0));

        expect(date).toBe("2026-11-18");
        expect(day).toBe("Wednesday");
    });

    it.each([
        [new Date(2026, 10, 15, 12), "Sunday"],
        [new Date(2026, 10, 16, 12), "Monday"],
        [new Date(2026, 10, 21, 12), "Saturday"],
    ])("names the weekday for %s", (input, expected) => {
        expect(temporalGrounding(input).day).toBe(expected);
    });
});

describe("lastActiveDateString", () => {
    const now = new Date(2026, 10, 18, 12, 0, 0);

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reports minutes for recent activity", () => {
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        expect(lastActiveDateString(fiveMinutesAgo)).toBe("It has been 5 minutes since the last message from the user.");
    });

    it("keeps reporting minutes up to and including an hour", () => {
        const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        expect(lastActiveDateString(anHourAgo)).toBe("It has been 60 minutes since the last message from the user.");
    });

    it("switches to whole hours after an hour", () => {
        const threeAndAHalfHoursAgo = new Date(now.getTime() - 210 * 60 * 1000);
        expect(lastActiveDateString(threeAndAHalfHoursAgo)).toBe("It has been 3 hours since the last message from the user.");
    });
});

export function temporalGrounding(date: Date): { date: string, day: string } {
    const dayOfWeek = date.getDay();
    const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    return {
        date: date.toISOString().split("T")[0],
        day: dayOfWeekString
    };
}

export function lastActiveDateString(userDate: Date): string {
    // minutes since the last user message
    const userDateDiff = Math.floor((Date.now() - userDate.getTime()) / 1000 / 60);
    const userDateString = userDateDiff > 60 ? `${Math.floor(userDateDiff / 60)} hours` : `${userDateDiff} minutes`;

    return `It has been ${userDateString} since the last message from the user.`;
}
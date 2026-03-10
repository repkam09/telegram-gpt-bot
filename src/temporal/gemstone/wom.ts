import { AchievementResponse, GroupDetailsResponse, GroupResponse, Membership, PlayerDetailsResponse, PlayerResponse, WOMClient } from "@wise-old-man/utils";

interface PaginationOptions {
    limit?: number;
    offset?: number;
}

export class WiseOldMan {
    private client: WOMClient;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private cache: Map<string, any>;

    constructor() {
        this.client = new WOMClient({
            userAgent: JSON.stringify({ discord: "repkam09", app: "gemstone", version: "1.0.0" })
        });

        this.cache = new Map();
    }

    public static PlayerDetailsDescription = "The PlayerDetails object contains information such as the player's combat level and latest snapshot.";
    public static PlayerDetailsSnapshot = "The Snapshot object contains snapshotId: integer, playerId: integer, data: SnapshotDataValues.";
    public static PlayerDetailsSnapshotData = "The SnapshotDataValues object contains detailed information about the player's status, activities, boss kills, etc.";

    private createCacheKey(fn: string, args: object): string {
        return `${fn}:${JSON.stringify(args)}`;
    }

    public searchPlayers(partialUsername: string, pagination?: PaginationOptions | undefined): Promise<PlayerResponse[]> {
        const cacheKey = this.createCacheKey("searchPlayers", { partialUsername, pagination });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.players.searchPlayers(partialUsername, pagination).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

    public getPlayerDetails(username: string): Promise<PlayerDetailsResponse> {
        const cacheKey = this.createCacheKey("getPlayerDetails", { username });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.players.getPlayerDetails(username).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

    public getPlayerDetailsById(playerId: number): Promise<PlayerDetailsResponse> {
        const cacheKey = this.createCacheKey("getPlayerDetailsById", { playerId });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.players.getPlayerDetailsById(playerId).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

    public getPlayerAchievements(username: string): Promise<AchievementResponse[]> {
        const cacheKey = this.createCacheKey("getPlayerAchievements", { username });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.players.getPlayerAchievements(username).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

    public getPlayerGroups(username: string): Promise<(Membership & {
        group: GroupResponse;
    })[]> {
        const cacheKey = this.createCacheKey("getPlayerGroups", { username });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.players.getPlayerGroups(username).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

    public getGroupDetailsById(groupId: number): Promise<GroupDetailsResponse> {
        const cacheKey = this.createCacheKey("getGroupDetailsById", { groupId });
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.client.groups.getGroupDetails(groupId).then((result) => {
            this.cache.set(cacheKey, result);
            return result;
        });
    }

}
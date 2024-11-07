import { HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { Database } from "./sqlite";

export class HennosGroup extends HennosConsumer {
    constructor(chatId: number) {
        super(chatId, "HennosGroup");
    }

    public allowFunctionCalling(): boolean {
        if (this.whitelisted) {
            return true;
        }

        return false;
    }

    public async setBasicInfo(name: string | undefined) {
        const result = await this.db.group.upsert({
            select: {
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            },
            update: {
                name
            },
            create: {
                chatId: this.chatId,
                name: name ?? "Group Chat"
            }
        });
        this.whitelisted = result.whitelisted;
    }

    public async getBasicInfo() {
        const result = await this.db.group.findUniqueOrThrow({
            select: {
                whitelisted: true,
                name: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = result.whitelisted;
        this.displayName = result.name;
        return {
            name: result.name
        };
    }

    public getProvider() {
        if (this.whitelisted) {
            return HennosOpenAISingleton.instance();
        }
        return HennosOpenAISingleton.mini();
    }

    public setWhitelisted(whitelisted: boolean) {
        const db = Database.instance();
        return db.group.update({
            where: {
                chatId: this.chatId
            },
            data: {
                whitelisted
            }
        });
    }

    static async async(chatId: number, name?: string): Promise<HennosGroup> {
        const group = new HennosGroup(chatId);
        await group.setBasicInfo(name);
        await group.getBasicInfo();
        return group;
    }

    static async exists(chatId: number): Promise<HennosGroup | null> {
        const db = Database.instance();
        const result = await db.group.findUnique({
            select: {
                chatId: true
            },
            where: {
                chatId
            }
        });

        if (!result) {
            return null;
        }

        const instance = new HennosGroup(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }
}
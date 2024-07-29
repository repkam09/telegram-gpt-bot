import { HennosConsumer } from "./base";

export class HennosGroup extends HennosConsumer {
    constructor(chatId: number) {
        super(chatId, "HennosGroup");
    }

    public allowFunctionCalling(): boolean {
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

    static async async(chatId: number, name?: string): Promise<HennosGroup> {
        const group = new HennosGroup(chatId);
        await group.setBasicInfo(name);
        await group.getBasicInfo();
        return group;
    }
}
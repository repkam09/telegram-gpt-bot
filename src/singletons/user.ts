import { Database } from "./sqlite";
import { Config } from "./config";
import { ValidTTSNames } from "../handlers/voice";
import { HennosConsumer } from "./base";

type ValidLLMProviders = "openai" | "ollama" | "anthropic"

export class HennosUser extends HennosConsumer {
    constructor(chatId: number) {
        super(chatId, "HennosUser");
    }

    public allowFunctionCalling(): boolean {
        if (this.isAdmin()) {
            return true;
        }

        if (this.whitelisted) {
            return true;
        }

        return false;
    }

    public isAdmin(): boolean {
        if (Config.TELEGRAM_BOT_ADMIN === this.chatId) {
            return true;
        }

        if (Config.DISCORD_BOT_ADMIN === this.chatId) {
            return true;
        }

        return false;
    }

    public async getBasicInfo() {
        const result = await this.db.user.findUniqueOrThrow({
            select: {
                whitelisted: true,
                firstName: true,
                lastName: true,
                username: true,
                latitude: true,
                longitude: true,
                experimental: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = this.isAdmin() ? true : result.whitelisted;
        this.experimental = this.isAdmin() ? true : result.experimental;
        this.displayName = `${result.firstName} ${result.lastName}`;
        return {
            firstName: result.firstName,
            lastName: result.lastName,
            username: result.username,
            location: (result.latitude && result.longitude) ? {
                latitude: result.latitude,
                longitude: result.longitude
            } : null
        };
    }

    public async getPreferences() {
        const result = await this.db.user.findUniqueOrThrow({
            select: {
                firstName: true,
                preferredName: true,
                botName: true,
                voice: true,
                provider: true,
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            }
        });

        let provider = "ollama";
        if (result.whitelisted) {
            // Set a default provider of openai for whitelisted users
            provider = result.provider ? result.provider : "openai";
        }

        return {
            preferredName: result.preferredName ? result.preferredName : result.firstName,
            botName: result.botName ? result.botName : "Hennos",
            voice: result.voice ? result.voice as ValidTTSNames : "onyx" as ValidTTSNames,
            provider: provider as ValidLLMProviders,
            personality: "default"
        };
    }

    public async setPreferredName(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                preferredName: name
            }
        });
    }

    public async setPreferredBotName(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                botName: name
            }
        });
    }

    public async setPreferredVoice(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                voice: name
            }
        });
    }

    public async setPreferredProvider(provider: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                provider: provider
            }
        });
    }

    public async setBasicInfo(firstName: string, lastName?: string, username?: string) {
        const record = await this.db.user.upsert({
            select: {
                whitelisted: true,
                experimental: true
            },
            where: {
                chatId: this.chatId
            },
            update: {
                firstName,
                lastName,
                username
            },
            create: {
                chatId: this.chatId,
                firstName,
                lastName,
                username,
                whitelisted: this.isAdmin(),
                experimental: this.isAdmin()
            }
        });
        this.whitelisted = record.whitelisted;
        this.experimental = record.experimental;
    }

    public setWhitelisted(whitelisted: boolean) {
        const db = Database.instance();
        return db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                whitelisted
            }
        });
    }

    public setExperimental(experimental: boolean) {
        const db = Database.instance();
        return db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                experimental
            }
        });
    }

    public async updateLocation(latitude: number, longitude: number): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                latitude,
                longitude
            }
        });
    }

    static async exists(chatId: number): Promise<HennosUser | null> {
        const db = Database.instance();
        const result = await db.user.findUnique({
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

        const instance = new HennosUser(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }

    static async async(chatId: number, firstName: string, lastName?: string, username?: string): Promise<HennosUser> {
        const user = new HennosUser(chatId);
        await user.setBasicInfo(firstName, lastName, username);
        await user.getBasicInfo();
        return user;
    }
}
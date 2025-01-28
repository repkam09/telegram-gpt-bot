import { Database } from "./sqlite";
import { Config } from "./config";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosImage, ValidLLMProvider, ValidTTSName } from "../types";
import { HennosOllamaSingleton } from "./ollama";
import { HennosOpenAISingleton } from "./openai";
import { HennosAnthropicSingleton } from "./anthropic";
import { Logger } from "./logger";
import { HennosGoogleSingleton } from "./google";
import { HennosMockSingleton } from "./mock";
import { MessageClassifier } from "./classifier";

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

    public getProvider(): HennosBaseProvider {
        if (this.whitelisted) {
            switch (this.provider) {
                case "openai": {
                    return HennosOpenAISingleton.instance();
                }
                case "ollama": {
                    return HennosOllamaSingleton.instance();
                }
                case "anthropic": {
                    return HennosAnthropicSingleton.instance();
                }
                case "google": {
                    return HennosGoogleSingleton.instance();
                }
                case "mock": {
                    return HennosMockSingleton.instance();
                }
                default: {
                    Logger.warn(this, `Unknown provider ${this.provider}, defaulting to OpenAI`);
                    return HennosOpenAISingleton.instance();
                }
            }
        }
        return HennosOpenAISingleton.mini();
    }

    public async getSmartProvider(message: string): Promise<HennosBaseProvider> {
        if (!this.whitelisted) {
            return HennosOpenAISingleton.mini();
        }

        const classification = await MessageClassifier.classify(this, message);
        if (classification === "complex") {
            return this.getProvider();
        }

        return HennosOpenAISingleton.mini();
    }

    public async updateUserChatImageContext(image: HennosImage): Promise<void> {
        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: "user",
                type: "image",
                content: JSON.stringify({
                    local: image.local,
                    mime: image.mime,
                }),
                from: this.chatId
            }
        });
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
                experimental: true,
                provider: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = this.isAdmin() ? true : result.whitelisted;
        this.experimental = this.isAdmin() ? true : result.experimental;
        this.displayName = `${result.firstName} ${result.lastName ?? ""}`.trim();
        this.provider = result.provider as ValidLLMProvider;

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
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            }
        });

        return {
            preferredName: result.preferredName ? result.preferredName : result.firstName,
            botName: result.botName ? result.botName : "Hennos",
            voice: result.voice ? result.voice as ValidTTSName : "onyx" as ValidTTSName,
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

    public async setPreferredProvider(provider: ValidLLMProvider): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                provider: provider
            }
        });
        this.provider = provider;
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

    static async fromHennosLink(link: string): Promise<HennosUser | null> {
        const db = Database.instance();
        const result = await db.hennosLink.findUnique({
            select: {
                chatId: true
            },
            where: {
                link
            }
        });

        if (!result) {
            return null;
        }

        const instance = new HennosUser(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }
}
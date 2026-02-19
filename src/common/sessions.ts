import { Database } from "../database";


export async function getLinkedSession(platform: string, chatId: string): Promise<string | null> {
    const db = Database.instance();

    const resut = await db.workflowSessionLink.findUnique({
        where: {
            chatId_platform: {
                chatId,
                platform
            }
        },
        select: {
            workflowSessionId: true
        }
    });

    if (!resut) {
        return null;
    }

    return resut.workflowSessionId;
}

export async function createLinkedSession(platform: string, chatId: string, workflowSessionId: string): Promise<string> {
    const db = Database.instance();

    const existing = await getLinkedSession(platform, chatId);
    if (existing) {
        throw new Error(`Session already exists for platform ${platform} and chatId ${chatId}`);
    }

    await db.workflowSessionLink.create({
        data: {
            chatId,
            platform,
            workflowSessionId
        }
    });

    return workflowSessionId;
}


export async function createSession(): Promise<string> {
    const db = Database.instance();

    const session = await db.workflowSession.create({
        data: {}
    });

    return session.id;
}
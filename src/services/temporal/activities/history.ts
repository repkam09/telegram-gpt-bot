import { Database } from "../../../singletons/data/sqlite";

export async function fetchWorkflowMessages(userId: string): Promise<{ role: string, content: string, datetime: Date }[]> {
    const db = Database.instance();
    const messages = await db.workflowMessage.findMany({
        where: {
            userId: userId,
        },
        orderBy: {
            datetime: "asc",
        },
        take: 100
    });

    return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        datetime: msg.datetime,
    }));
}

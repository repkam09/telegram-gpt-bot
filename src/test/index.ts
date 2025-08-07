import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";

export async function createTestUser() {
    await Database.init();

    const user = await HennosUser.async(-1, "jest");
    await user.setWhitelisted(true);
    await user.clearChatContext();

    return user;
}
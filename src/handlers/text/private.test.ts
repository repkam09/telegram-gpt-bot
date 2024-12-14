import { HennosUser } from "../../singletons/user";
import { createTestUser } from "../../test";
import { handlePrivateMessage } from "./private";

describe("private message handler", () => {
    let user: HennosUser;

    beforeAll(async () => {
        user = await createTestUser();
    });

    test("handlePrivateMessage", async () => {
        const response = await handlePrivateMessage(user, "test");
        expect(response).toBeDefined();
    });
});
import { Express, Request, Response } from "express";
import { SupabaseInstance } from "../../singletons/supabase";

export class SupabaseWebhookInstance {
    public static init(app: Express) {
        app.post("/hennos/login", async (req: Request, res: Response) => {
            if (!req.body) {
                return res.status(400).json({ status: "error", message: "Missing request body" });
            }

            if (!req.body.email) {
                return res.status(400).json({ status: "error", message: "Missing email" });
            }
            if (!req.body.password) {
                return res.status(400).json({ status: "error", message: "Missing password" });
            }

            const result = await SupabaseInstance.signInWithPassword(req.body.email, req.body.password);
            if (result.error) {
                return res.status(401).json({ status: "error", message: result.error.message });
            }

            return res.status(200).json({ status: "ok", token: result.accessToken });
        });

        app.get("/hennos/account", async (req: Request, res: Response) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ status: "error", message: "Missing Authorization header" });
            }

            const token = authHeader.split(" ")[1];
            if (!token) {
                return res.status(401).json({ status: "error", message: "Invalid Authorization header format" });
            }

            const result = await SupabaseInstance.getUser(token);
            if (result.error) {
                return res.status(401).json({ status: "error", message: result.error.message });
            }

            return res.status(200).json({ status: "ok", user: result.user });
        });

        app.use(SupabaseInstance.middleware());
    }
}
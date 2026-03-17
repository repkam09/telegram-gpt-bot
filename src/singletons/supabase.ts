import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { Logger } from "./logger";
import { Config } from "./config";
import { Request, Response, NextFunction } from "express";


export class SupabaseInstance {
    private static client: SupabaseClient | null = null;

    public static async init(): Promise<void> {
        if (!Config.SUPABASE_ANON_KEY) {
            throw new Error("SUPABASE_ANON_KEY is not set in Config");
        }

        if (!Config.SUPABASE_URL) {
            throw new Error("SUPABASE_URL is not set in Config");
        }

        if (!Config.SUPABASE_ANON_KEY) {
            throw new Error("SUPABASE_ANON_KEY is not set in Config");
        }

        SupabaseInstance.client = createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY);

        // Check that the client functions
        try {
            const { error } = await SupabaseInstance.client.auth.getSession();
            if (error) {
                Logger.error("Supabase", `Error initializing Supabase client: ${error.message}`);
                throw new Error(`Error initializing Supabase client: ${error.message}`);
            }

            Logger.info("Supabase", "Supabase client initialized and connection verified");
        } catch (error) {
            Logger.error("Supabase", `Error verifying Supabase client connection: ${(error as Error).message}`);
            throw new Error(`Error verifying Supabase client connection: ${(error as Error).message}`);
        }

        Logger.info("Supabase", "SupabaseInstance initialized successfully");

    }

    public static async getUser(jwt: string): Promise<{ user: User | null; error: Error | null }> {
        if (!SupabaseInstance.client) {
            Logger.error("Supabase", "Supabase client is not initialized");
            return { user: null, error: new Error("Supabase client is not initialized") };
        }

        try {
            const { data, error } = await SupabaseInstance.client.auth.getUser(jwt);

            if (error || !data || !data.user) {
                Logger.warn("Supabase", `Supabase getUser failed: ${error?.message || "No user data returned"}`);
                return { user: null, error: error || new Error("No user data returned") };
            }

            return { user: data.user, error: null };
        } catch (error) {
            Logger.error("Supabase", `Error getting user from Supabase: ${(error as Error).message}`);
            return { user: null, error: error as Error };
        }
    }

    public static async signInWithPassword(email: string, password: string): Promise<{ accessToken: string | null; error: Error | null }> {
        if (!SupabaseInstance.client) {
            Logger.error("Supabase", "Supabase client is not initialized");
            return { accessToken: null, error: new Error("Supabase client is not initialized") };
        }

        try {
            const { data, error } = await SupabaseInstance.client.auth.signInWithPassword({ email, password });

            if (error || !data || !data.session) {
                Logger.warn("Supabase", `Supabase sign-in failed: ${error?.message || "No session data returned"}`);
                return { accessToken: null, error: error || new Error("No session data returned") };
            }

            return { accessToken: data.session.access_token, error: null };
        } catch (error) {
            Logger.error("Supabase", `Error signing in with Supabase: ${(error as Error).message}`);
            return { accessToken: null, error: error as Error };
        }
    }

    public static async validate(jwt: string): Promise<{ valid: boolean }> {
        if (!SupabaseInstance.client) {
            Logger.error("Supabase", "Supabase client is not initialized");
            return { valid: false };
        }

        try {
            const { data, error } = await SupabaseInstance.client.auth.getUser(jwt);

            if (error || !data || !data.user) {
                Logger.warn("Supabase", `Supabase validation failed: ${error?.message || "No user data returned"}`);
                return { valid: false };
            }

            return { valid: true };
        } catch (error) {
            Logger.error("Supabase", `Error validating JWT with Supabase: ${(error as Error).message}`);
            return { valid: false };
        }
    }

    public static middleware() {
        return async (req: Request, res: Response, next: NextFunction) => {
            if (!Config.HENNOS_SUPABASE_ENABLED) {
                return next();
            }

            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send("Authorization header missing");
            }

            const token = authHeader.split(" ")[1];
            if (!token) {
                return res.status(401).send("Bearer token missing");
            }

            const validation = await SupabaseInstance.validate(token);
            if (!validation.valid) {
                return res.status(401).send("Invalid token");
            }

            return next();
        };
    }
}

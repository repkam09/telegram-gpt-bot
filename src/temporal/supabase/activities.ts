import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { SupabaseInstance } from "../../singletons/supabase";

export async function keepSupabaseActive(): Promise<void> {
    const email = Config.SUPABASE_KEEPALIVE_EMAIL;
    const password = Config.SUPABASE_KEEPALIVE_PASSWORD;

    if (!email || !password) {
        throw new Error("Supabase keepalive credentials are not configured");
    }

    const { error } = await SupabaseInstance.signInWithPassword(email, password);
    if (error) {
        throw new Error(`Supabase keepalive sign-in failed: ${error.message}`);
    }

    Logger.info("SupabaseKeepalive", "Supabase keepalive sign-in completed successfully");
}
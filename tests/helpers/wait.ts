/**
 * Polls until the predicate returns true. Useful for asserting on the side effects of a long-lived
 * workflow (which never "completes" on its own) before terminating it.
 */
export async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<void> {
    const { timeoutMs = 15000, intervalMs = 25, description = "condition" } = options;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
}

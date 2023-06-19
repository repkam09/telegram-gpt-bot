import axios from "axios";
import { FuncParams } from "../singletons/functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetch(url: string, headers: any = {}): Promise<unknown | undefined> {
    try {
        const data = await axios.get(url, {
            headers: headers
        });
        return data.data as unknown;
    } catch (err: unknown) {
        return undefined;
    }
}

export function formatResponse(input: FuncParams, message: string, data: unknown,) {
    return JSON.stringify({
        error: false,
        message,
        data,
        input
    });
}

export function formatErrorResponse(input: FuncParams, message: string) {
    return JSON.stringify({
        error: true,
        message,
        data: undefined,
        input
    });
}

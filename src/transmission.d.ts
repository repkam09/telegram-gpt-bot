declare module "transmission" {
    interface TransmissionOptions {
        port: number;
        host: string;
        username?: string;
        password?: string;
    }

    interface AddUrlCallback {
        (err: Error | null, result: unknown): void;
    }

    interface AddFileCallback {
        (err: Error | null, result: unknown): void;
    }

    class Transmission {
        constructor(options: TransmissionOptions);

        addUrl(url: string, options: object, callback: AddUrlCallback): void;
        addFile(filePath: string, options: object, callback: AddFileCallback): void;
        active(callback: (err: Error | null, result: unknown) => void): void;
    }

    export = Transmission;
}

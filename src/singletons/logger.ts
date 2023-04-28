/* eslint-disable @typescript-eslint/no-explicit-any */

export class Logger {
    static info(message?: any, ...optionalParams: any[]): void {
        console.log(message, ...optionalParams);
    }

    static warn(message?: any, ...optionalParams: any[]): void  {
        console.warn(message, ...optionalParams);
    }

    static error(message?: any, ...optionalParams: any[]): void  {
        console.error(message, ...optionalParams);
    }

    static debug(message: string): void {
        console.info("DEBUG:", message);
    }
}
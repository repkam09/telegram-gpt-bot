export class Logger {
    static info() {
        console.log(...arguments);
    }

    static warn() {
        console.warn(...arguments);
    }

    static error() {
        console.error(...arguments);
    }
}
export class Logger {
    constructor(options = {}) {
        this.level = options.level || 'error'
    }

    info() {
        console.log(...arguments)
    }

    warn() {
        console.warn(...arguments)
    }

    debug() {
        console.debug(...arguments)
    }

    error() {
        console.error(...arguments)
    }
}
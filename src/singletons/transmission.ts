import Transmission from "transmission";
import { Config } from "./config";

export class TransmissionWrapper {
    private static _transmission: Transmission;

    public static async init() {
        this._transmission = new Transmission({
            host: Config.TRANSMISSION_HOST,
            port: Config.TRANSMISSION_PORT,
            username: Config.TRANSMISSION_USERNAME,
            password: Config.TRANSMISSION_PASSWORD
        });
    }

    public static async addUrl(url: string, options: object): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this._transmission.addUrl(url, options, (err, result) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve(result);
                }
            });
        });
    }

    public static async getActive(): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this._transmission.active((err, result) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve(result);
                }
            });
        });
    }

}
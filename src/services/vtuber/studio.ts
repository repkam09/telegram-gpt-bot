import fs from "fs/promises";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { WebSocket } from "ws";
import { ApiClient, IApiClientOptions } from "vtubestudio";

export class VTubeStudioInstance {
    static async setAuthToken(authenticationToken: string) {
        Logger.info("Storing VTube Studio auth token: " + authenticationToken);
        // store the authentication token in a file
        const storagePath = Config.LOCAL_STORAGE(undefined);
        await fs.writeFile(`${storagePath}vtubestudio_token.txt`, authenticationToken, {
            encoding: "utf-8",
        });
    }

    static async getAuthToken() {
        Logger.info("Retrieving VTube Studio auth token");
        // retrieve the stored authentication token
        const storagePath = Config.LOCAL_STORAGE(undefined);
        try {
            const token = await fs.readFile(`${storagePath}/vtubestudio_token.txt`, "utf-8");
            Logger.info("Retrieved VTube Studio auth token: " + token);
            return token;
        } catch (error) {
            Logger.error("Failed to retrieve VTube Studio auth token:", error);
            return null;
        }
    }

    static async init() {
        const options: IApiClientOptions = {
            authTokenGetter: VTubeStudioInstance.getAuthToken,
            authTokenSetter: VTubeStudioInstance.setAuthToken,
            pluginName: "Hennos",
            pluginDeveloper: "repkam09",
            webSocketFactory: (url: string) => new WebSocket(url),
            port: Config.VTUBE_STUDIO_PORT,
            url: `ws://${Config.VTUBE_STUDIO_HOST}:${Config.VTUBE_STUDIO_PORT}`
        };

        const apiClient = new ApiClient(options);

        apiClient.on("connect", async () => {
            const stats = await apiClient.statistics();

            Logger.info(`Connected to VTube Studio v${stats.vTubeStudioVersion}`);

            const { availableModels } = await apiClient.availableModels();

            Logger.info(`Available models: ${availableModels.map(m => m.modelName).join(", ")}`);

            await apiClient.events.modelLoaded.subscribe((data) => {
                if (data.modelLoaded) {
                    Logger.info("Model loaded event: " + data.modelID);
                }
            }, {});
        });
    }
}
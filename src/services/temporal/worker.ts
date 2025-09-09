import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { Config } from "../../singletons/config";


export class HennosTemporalWorker {
    static async init() {
        const connection = await NativeConnection.connect({
            address: `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}`,
        });

        const worker = await Worker.create({
            connection,
            namespace: Config.TEMPORAL_NAMESPACE,
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
            workflowsPath: require.resolve("./workflows"),
            activities,
        });

        worker.run().finally(() => connection.close());
    }
}
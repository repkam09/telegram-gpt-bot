import { createClient } from "redis";

async function main() {
    const redisSrc = createClient({
        url: process.env.REDIS_REMOTE_URL
    });

    const redisDst = createClient({
        url: "redis://localhost:6379"
    });

    await redisSrc.connect();
    await redisDst.connect();

    const keys = await redisSrc.keys("hennos:*");

    const promises = keys.map(async (key) => {
        const string = await redisSrc.get(key) as string;

        // base64 encode the string
        const encoded = Buffer.from(string).toString("base64");

        console.log(key, encoded);

        // set the key in the new redis instance
        await redisDst.set(key, string);
        return encoded;
    });

    await Promise.all(promises);
    await redisSrc.disconnect();
    await redisDst.disconnect();
}

main();
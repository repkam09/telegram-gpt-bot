# Hennos

A Telegram chat bot that can use different LLM providers to chat with and respond to user queries.

The live production version of Hennos can be found here on Telegram at [Hennos](https://t.me/repka_gpt_bot) or on the web at [Hennos Web](https://hennos.app/).

## Technical Specifics

Hennos is built in a few different parts, the main core being a Temporal Workflow (`legacyWorkflow`) that makes up the conversation behavior. The Workflow handles incoming messages via Signals. The remainder of the core is made up of a set of wrapper Activities around tools, LLM calls, and other common functions that the Workflow can call to perform its tasks.

Outside of the core are different clients that can send signals to the Workflow to interact with the system. Currently supported clients include:

- Telegram
- Web (via REST API, with Server-Sent Events for responses)
- CLI (development only)
- OpenAI Realtime SIP voice calls

## Running Hennos

### Docker Image Build

Build and tag the image locally with the following command:

```shell
docker build -t hennos-gpt .
```

### Configure Environment Variables

Copy the `.env.dev` file to `.env` and fill in the required environment variables.

### Start the Bot in Docker

Start the bot with the following command:

```shell
docker compose up
```

### Start the Bot locally (Optional)

If you want to run the bot locally, you can start it with the following command:

```shell
npm run dev
```

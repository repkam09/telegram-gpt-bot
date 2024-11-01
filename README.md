# Hennos

A Telegram chat bot that can use different LLM providers to chat with and respond to user queries.

The live production version of Hennos can be found here: [Hennos](https://t.me/repka_gpt_bot)


## Technical Specifics

Hennos is built in a couple different parts, the main core being wrappers around common LLM features such as text input, image input, and voice input and the Telegram Bot part, which handles the different Telegram input types and maps them into one of the core functions for the LLMs to process.

Hennos supports three different LLM providers: OpenAI, Anthropic, and Ollama. The specific models that are used for each can be configured via environment variables.

Hennos has very complete Telegram integration along with very basic integration for Discord and Twitch.

## User Permissions

Hennos has a basic user permission system where certain features and models can be configured based on a whitelist.

For whitelisted users, Hennos will keep their previous messages, stored in sqlite, and can respond conversationally keeping that previous discussion in mind. The amount of tokens that should be kept in context is configurable along with the specific models used.

For non-whitelisted users, Hennos will respond to the immediate message, but not use any previous conversation context. Non-whitelisted users are also limited to Ollama and local models only. Their messages are also run through the OpenAI Moderation endpoint. 

Note that, like most LLM powered tools, information is not at all guaranteed to be factual.



# Running Hennos

### Docker Image Build

Build and tag the image locally with the following command:
```
docker build -t hennos-gpt .
```

### Configure Environment Variables

Copy the `.env.dev` file to `.env` and fill in the required environment variables.

### Start the Bot in Docker

Start the bot with the following command:
```
docker compose up
```

### Start the Bot locally (Optional)

If you want to run the bot locally, you can start it with the following command:
```
npm run dev
```

### Test Scripts

For development, or other experimentation, there are a few scripts that are configured to be launched with the vscode debugger (via launch.json).

These will allow you to chat with the bot outside of Telegram.





# Hennos

A Telegram chat bot that uses the OpenAI API to respond to user queries

The production version of Hennos can be found here: [Hennos](https://t.me/repka_gpt_bot)

Note that there is currently a whitelist and access is limited to a few users. 

## Technical Specifics

Hennos is mostly built around the OpenAI API and GPT-4 and makes use of many of the latest features provided by the API.

Responses are generated using the [Chat Completions API](https://platform.openai.com/docs/guides/gpt/chat-completions-api).

Hennos can fetch certain real-time information using the [function calling](https://platform.openai.com/docs/guides/gpt/function-calling) features. 

Because Telegram supports voice messages, you can also send a voice message to Hennos which will then use [Whisper](https://platform.openai.com/docs/guides/speech-to-text) to transcribe your voice. The bot can now also respond with a voice message of its own using the OpenAI TTS APIs.

For whitelisted users Hennos keeps previous chat context, stored in sqlite, and can respond conversationally keeping previous discussion in mind. The amount of tokens that should be kept in context is configurable. For non-whitelisted users, no previous chat context is stored to keep API costs low.

For whitelisted users, the most powerful GPT-4 is used. For non-whitelisted users, a cheaper GPT-3.5 model is used.

You can optionally configure the bot to use Ollama for these non-whitelisted users, which is a self-hosted platform for running LLMs on your own hardware. See the [Ollama](https://ollama.ai/) documentation for more information and the `.env.dev` file for configuration options.

Note that, like most Large Language Models, information is not at all guaranteed to be factual.


# Running Hennos

### Docker Image Build

Build and tag the image locally with the following command:
```
docker build -t hennos-gpt .
```

### Configure Environment Variables

Copy the `.env.dev` file to `.env` and fill in the required environment variables.

### Create Development Sqlite Database

If you want to use Redis to store chat context, you can start a Redis container with the following command:
```
npm run migrate:reset
```


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
For development, or other experimentation, there are a few scripts that are configured to be launched with the vscode debugger (via launch.json). These will allow you to chat with the bot outside of Telegram. 





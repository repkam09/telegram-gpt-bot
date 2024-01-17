# Hennos

A Telegram chat bot that uses the OpenAI API to respond to user queries

The production version of Hennos can be found here: [Hennos](https://t.me/repka_gpt_bot)

Note that there is currently a whitelist and access is limited to a few users. 

## Technical Specifics

Hennos is mostly built around the OpenAI API and GPT-4 and makes use of many of the latest features provided by the API.

Responses are generated using the [Chat Completions API](https://platform.openai.com/docs/guides/gpt/chat-completions-api).
Hennos can fetch certain real-time information using the [function calling](https://platform.openai.com/docs/guides/gpt/function-calling) features. Right now this includes just basic weather information.

Because Telegram supports voice messages, you can also send a voice message to Hennos which will then use [Whisper](https://platform.openai.com/docs/guides/speech-to-text) to transcribe your voice. As of OpenAI Dev Day, the bot can now also respond with a voice message using the new TTS API.

Hennos keeps previous chat context, optionally in Redis, and can respond conversationally keeping previous discussion and information to better respond. Right now this is just the last 20 (configurable) messages or until the context is larger than the API will allow for.

For whitelisted users, the most powerful GPT-4 is used. For non-whitelisted users, a cheaper GPT-3.5 model is used. You can also configure the bot to use Ollama for these non-whitelisted users, which is a self-hosted platform for running LLMs on your own hardware. See the [Ollama](https://ollama.ai/) documentation for more information and the `.env.dev` file for configuration options.

Note that, like most Large Language Models, information is not at all guaranteed to be factual.


# Running Hennos

### Docker Image Build

Build and tag the image locally with the following command:
```
docker build -t hennos-gpt .
```

### Start Redis (Optional)

If you want to use Redis to store chat context, you can start a Redis container with the following command:
```
npm run redis
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





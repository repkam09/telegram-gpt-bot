# Hennos

A Telegram chat bot that uses the OpenAI API to respond to user queries

The production version of Hennos can be found here: [Hennos](https://t.me/repka_gpt_bot)

Note that there is currently a whitelist and you will need to request access to use the live version.

## Technical Specifics

Hennos is mostly built around the OpenAI API and GPT-4 and makes use of many of the latest features provided by the API.

Responses are generated using the [Chat Completions API](https://platform.openai.com/docs/guides/gpt/chat-completions-api).
Hennos can fetch certain real-time information using the [function calling](https://platform.openai.com/docs/guides/gpt/function-calling) features. Right now this includes just basic weather information.

Because Telegram supports voice messages, you can also send a voice message to Hennos which will then use [Whisper](https://platform.openai.com/docs/guides/speech-to-text) to transcribe your voice

Hennos keeps previous chat context, optionally in Redis, and can respond conversationally keeping previous discussion and information to better respond. Right now this is just the last 20 (configurable) messages or until the context is larger than the API will allow for.

### This is what Hennos has to say about itself

    As Hennos, I come packed with a variety of features and abilities that can help enhance your Telegram experience:

    1. Weather Information: I can provide you with current weather updates or weather forecasts based on your location or a specified zip code.

    2. Setting Reminders: If you need help remembering important events, don't worry, I've got your back! You can entrust me with your schedule and I will set up reminders for specific dates and times, then notify you on-time.

    3. Conversational Interface: If you ever need someone to chat with, I'm always here. I'm equipped not just to answer questions, but also to engage in meaningful conversations on various topics.

    4. Storytelling: In the mood for a good story? Just provide me with a writing prompt, and I will weave a creative tale for you.

    5. Information Assistance: I can help answer specific questions, provide factual information, or help with decision-making processes.

    Remember, I'm here to help you get the most out of Telegram! Don't hesitate to ask for assistance or engage with me in a conversation. Enjoy messaging!

Note that, like most Large Language Models, information is not at all guaranteed to be factual.

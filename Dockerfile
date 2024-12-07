FROM node:20-buster

# Set the working directory
WORKDIR /app/hennos

# Install some apt deps
RUN apt update
RUN apt install -y ffmpeg build-essential

# Install yt-dlp
RUN apt install -y python3 python3-pip libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
RUN python3 -m pip install -U "yt-dlp[default]"

RUN yt-dlp --version

# Copy package.json and package-lock.json
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY tsconfig.json tsconfig.json
COPY .eslintrc.json .eslintrc.json
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma/migrations prisma/migrations

# Install dependencies
RUN npm install

RUN ./node_modules/nodejs-whisper/cpp/whisper.cpp/models/download-ggml-model.sh base.en
RUN ./node_modules/nodejs-whisper/cpp/whisper.cpp/models/download-ggml-model.sh tiny.en

# Copy the rest of the application code
COPY src src

# Run the typescript build
RUN npm run build

# Start the application
CMD [ "npm", "start" ]

FROM node:22-bookworm

# Set the working directory
WORKDIR /app/hennos

# Install some apt deps
RUN apt update
RUN apt install -y ffmpeg build-essential

# Install yt-dlp
RUN apt install -y python3 python3-pip
RUN python3 -m pip install --break-system-packages -U "yt-dlp[default]"

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

# Copy the rest of the application code
COPY src src

# Run the typescript build
RUN npm run build

# Start the application
CMD [ "npm", "start" ]

FROM node:24-bookworm

# Set the working directory
WORKDIR /app/hennos

# Install some apt deps
RUN apt update
RUN apt install -y build-essential python3 python3-pip libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

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

FROM node:20

# Set the working directory
WORKDIR /app/hennos

# Copy package.json and package-lock.json
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY tsconfig.json tsconfig.json
COPY .eslintrc.json .eslintrc.json

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY src src

# Run the typescript build
RUN npm run build

# Start the application
CMD [ "npm", "start" ]

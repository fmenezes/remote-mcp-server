FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and SDK
COPY . .

# Build the SDK first
WORKDIR /app/third_party/@modelcontextprotocol/sdk
RUN npm install
RUN npm run build

# Build the main application
WORKDIR /app
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

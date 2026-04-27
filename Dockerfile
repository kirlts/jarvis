FROM node:24-alpine

WORKDIR /app

# Ensure curl/wget is available for healthchecks
RUN apk add --no-cache curl wget

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

ENV NODE_ENV=production

# Default command, overridden in docker-compose.yml
CMD ["node", "src/server.js"]

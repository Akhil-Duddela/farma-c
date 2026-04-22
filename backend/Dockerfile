# Farm-C AI API
#
# Ollama (AI enhancer, automation) is configured at runtime; do not bake tokens here.
# Typical values when the stack includes the `ollama` service (see repo docker-compose.yml):
#   OLLAMA_BASE_URL=http://ollama:11434
#   OLLAMA_MODEL=llama3
#   OLLAMA_TIMEOUT_MS=120000
# If Ollama runs on the host instead, pass e.g. OLLAMA_BASE_URL=http://host.docker.internal:11434
# and add host-gateway mapping in Compose (or run the API on the host).
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]

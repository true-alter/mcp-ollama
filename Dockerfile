FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=hermes3:8b

CMD ["node", "dist/index.js"]

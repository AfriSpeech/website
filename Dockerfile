# Stage 1: Build the Astro static site
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time environment variables used by Astro
ARG PUBLIC_LISTEN_ENDPOINT="https://michsethowusuwfp--afrilisten-serve.modal.run"
ARG PUBLIC_LISTEN_API_KEY="098c7a395adcc7ed92698eece81d3fdd6ad2e5148650675e"
ENV PUBLIC_LISTEN_ENDPOINT=${PUBLIC_LISTEN_ENDPOINT}
ENV PUBLIC_LISTEN_API_KEY=${PUBLIC_LISTEN_API_KEY}

RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Only install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built frontend assets and required server files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/netlify ./netlify
COPY --from=builder /app/src/data ./src/data
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/server.mjs ./server.mjs

# Prepare persistent storage directory
RUN mkdir -p /app/data/traffic

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.mjs"]

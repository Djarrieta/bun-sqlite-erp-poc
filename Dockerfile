# syntax=docker/dockerfile:1

# Official Bun image (Debian slim) — runs TypeScript directly, no build step.
FROM oven/bun:1-slim

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy the rest of the source.
COPY . .

# SQLite database lives here; keep it as a volume so data survives restarts.
RUN mkdir -p data
VOLUME ["/app/data"]

ENV PORT=4000
EXPOSE 4000

CMD ["bun", "src/index.ts"]

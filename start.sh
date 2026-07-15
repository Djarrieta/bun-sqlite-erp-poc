#!/bin/bash
# This script pulls the latest changes and (re)deploys the app with Docker Compose.
# It runs two services defined in docker-compose.yml:
#   - web: the HTTP server (src/index.ts)
#   - bot: the Telegram bot (src/bot/index.ts)
# Both share the ./data volume (SQLite) and read secrets from .env.

set -e  # Exit on any error

# Function to check command status
check_command() {
    if [ $? -ne 0 ]; then
        echo "✗ Error: $1 failed"
        exit 1
    fi
}

git pull
check_command "Git pull"

# Ensure host data directory exists for volume mount (SQLite lives here)
mkdir -p data

# Secrets (TELEGRAM_BOT_TOKEN, DEEPSEEK_API_KEY, admin, ...) come from .env.
if [ ! -f .env ]; then
    echo "✗ Error: .env not found. Copy .env.example to .env and fill it in."
    exit 1
fi

# NOTE: We intentionally do NOT `docker rmi` old images here.
# Removing the image wipes Docker's build cache, forcing a full base-image
# pull + `bun install` on every deploy. Keeping it lets Docker reuse cached
# layers: when only source files change (not package.json / bun.lock), the
# dependency layer is reused and the rebuild is near-instant. Previous images
# simply become dangling and are cleaned up below.

# Build images (reuses cached layers when possible) and (re)create the
# containers. `--build` rebuilds, `-d` runs detached, `--remove-orphans`
# cleans up any service removed from the compose file.
sudo docker compose up -d --build --remove-orphans
check_command "Docker compose up"

# Prune dangling images left over from previous builds (keeps disk usage in
# check without touching the layer cache used by the active images).
sudo docker image prune -f || true

echo "✓ Services (web + bot) started successfully"

# Follow logs from both services.
sudo docker compose logs -f

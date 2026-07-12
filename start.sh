#!/bin/bash
# This script pulls the latest changes and (re)deploys the app with Docker.

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

# Stop the existing container (if running)
sudo docker stop bun-erp-c || true  # Don't fail if container doesn't exist

# Remove the existing container
sudo docker rm bun-erp-c || true    # Don't fail if container doesn't exist

# NOTE: We intentionally do NOT `docker rmi` the old image here.
# Removing the image wipes Docker's build cache, forcing a full base-image
# pull + `bun install` on every deploy. Keeping it lets Docker reuse cached
# layers: when only source files change (not package.json / bun.lock), the
# dependency layer is reused and the rebuild is near-instant. The previous
# image simply becomes dangling and is cleaned up below.

# Build the docker image (reuses cached layers when possible)
sudo docker build -t bun-erp-i .
check_command "Docker build"

# Prune dangling images left over from previous builds (keeps disk usage in
# check without touching the layer cache used by the active image).
sudo docker image prune -f || true

# Run the docker container mounting only the data directory for persistence
# and exposing the HTTP port.
sudo docker run -d \
    --name bun-erp-c \
    --restart=unless-stopped \
    -p 4000:4000 \
    -v "$(pwd)/data:/app/data" \
    bun-erp-i
check_command "Docker run"

# Display the container logs
sudo docker logs bun-erp-c
check_command "Docker logs"

echo "✓ Container bun-erp-c started successfully"

sudo docker logs -f bun-erp-c

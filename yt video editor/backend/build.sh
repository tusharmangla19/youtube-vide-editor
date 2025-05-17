#!/usr/bin/env bash

# Exit on error
set -e

echo "Starting build process..."

# Install curl if not present
command -v curl >/dev/null 2>&1 || { 
    echo "Installing curl..."
    apt-get update && apt-get install -y curl
}

echo "Installing yt-dlp..."
# Download yt-dlp binary directly
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Create symlink in /usr/bin (as backup)
ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp

echo "Verifying yt-dlp installation..."
# Verify yt-dlp is accessible
which yt-dlp
yt-dlp --version

echo "Installing Node.js dependencies..."
# Install Node.js dependencies
npm install

echo "Build process completed." 

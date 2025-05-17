#!/usr/bin/env bash

# Exit on error
set -e

echo "Starting build process..."

# Create a bin directory in the project
mkdir -p bin

echo "Installing yt-dlp..."
# Download yt-dlp binary to project's bin directory
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

echo "Verifying yt-dlp installation..."
# Verify yt-dlp is working
./bin/yt-dlp --version

echo "Installing Node.js dependencies..."
# Install Node.js dependencies
npm install

echo "Build process completed." 

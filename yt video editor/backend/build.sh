#!/usr/bin/env bash

# Exit on error
set -e

echo "Starting build process..."

# Create bin directory
echo "Creating bin directory..."
mkdir -p bin

echo "Installing yt-dlp..."
# Download yt-dlp binary to project's bin directory
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

# Double check the file exists and is executable
if [ ! -f bin/yt-dlp ]; then
    echo "Error: yt-dlp was not downloaded successfully"
    exit 1
fi

if [ ! -x bin/yt-dlp ]; then
    echo "Error: yt-dlp is not executable"
    exit 1
fi

echo "Verifying yt-dlp installation..."
# Verify yt-dlp is working
./bin/yt-dlp --version

echo "Installing Node.js dependencies..."
# Install Node.js dependencies
npm install

echo "Build process completed successfully!" 

#!/bin/bash

echo "Starting build process..."

# Create bin directory if it doesn't exist
echo "Creating bin directory..."
mkdir -p bin

# Function to download and verify yt-dlp
download_ytdlp() {
    echo "Installing yt-dlp..."
    
    # Download yt-dlp
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
    
    if [ $? -ne 0 ]; then
        echo "Failed to download yt-dlp"
        return 1
    fi
    
    # Make it executable
    chmod +x bin/yt-dlp
    
    if [ $? -ne 0 ]; then
        echo "Failed to make yt-dlp executable"
        return 1
    fi
    
    # Verify installation
    echo "Verifying yt-dlp installation..."
    ./bin/yt-dlp --version
    
    if [ $? -ne 0 ]; then
        echo "Failed to verify yt-dlp"
        return 1
    fi
    
    return 0
}

# Try to download yt-dlp up to 3 times
max_attempts=3
attempt=1

while [ $attempt -le $max_attempts ]; do
    echo "Attempt $attempt of $max_attempts to install yt-dlp"
    
    download_ytdlp
    
    if [ $? -eq 0 ]; then
        echo "yt-dlp installed successfully"
        break
    fi
    
    echo "Failed to install yt-dlp on attempt $attempt"
    
    if [ -f bin/yt-dlp ]; then
        rm bin/yt-dlp
    fi
    
    attempt=$((attempt + 1))
    
    if [ $attempt -le $max_attempts ]; then
        echo "Waiting 5 seconds before next attempt..."
        sleep 5
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "Failed to install yt-dlp after $max_attempts attempts"
    exit 1
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

echo "Build process completed successfully!" 

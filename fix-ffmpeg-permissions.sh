#!/bin/bash

# Script to fix FFmpeg permissions in the built Linux package
# This should be run after building the .deb package

echo "Fixing FFmpeg permissions for Linux build..."

# Find the FFmpeg binary in the unpacked directory
FFMPEG_PATH=""

# Check common locations for the FFmpeg binary
if [ -f "dist/linux-unpacked/resources/app.asar.unpacked/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg" ]; then
    FFMPEG_PATH="dist/linux-unpacked/resources/app.asar.unpacked/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg"
elif [ -f "dist/linux-unpacked/app.asar.unpacked/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg" ]; then
    FFMPEG_PATH="dist/linux-unpacked/app.asar.unpacked/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg"
fi

if [ -n "$FFMPEG_PATH" ]; then
    echo "Found FFmpeg at: $FFMPEG_PATH"
    chmod +x "$FFMPEG_PATH"
    echo "Fixed FFmpeg permissions"
else
    echo "FFmpeg binary not found in expected locations"
    echo "Searching for FFmpeg binary..."
    find dist/ -name "ffmpeg" -type f 2>/dev/null | head -5
fi

echo "Done!"

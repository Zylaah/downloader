# AudioTube Downloader

AudioTube Downloader is a desktop application built with Electron that allows users to easily search for YouTube videos and download their audio tracks in MP3 format. It provides a simple interface for searching, selecting a download location, and managing downloads.

## Features

*   **Search YouTube Videos:** Instantly search for YouTube videos directly within the application.
*   **Audio Extraction:** Download audio from YouTube videos and save them as MP3 files.
*   **Custom Download Path:** Choose and save a preferred directory for all your audio downloads.
*   **Progress Indication:** Visual progress bar showing download and conversion status.
*   **User-Friendly Interface:** Clean and intuitive interface for a seamless experience.
*   **Custom Titlebar:** Native-like window controls (minimize, maximize, close) for a consistent desktop feel.

## How to install ?

Just download the lastest release and use the setup file to install it on your Windows computer !

# If you want to build it yourself

## Prerequisites

Before you begin, ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (which includes npm)

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd downloader 
    ```
    (Replace `<your-repository-url>` with the actual URL of your Git repository, or if you're working locally, just navigate to the `downloader` directory.)

2.  **Install dependencies:**
    Open a terminal in the project's root directory and run:
    ```bash
    npm install
    ```
    This will install all the necessary packages defined in `package.json`, including Electron, yt-dlp-wrap, ffmpeg-static, and electron-store.

## How to Run the Application

Once the installation is complete, you can start the application using:

```bash
npm start
```

This command typically executes `electron .` as defined in your `package.json` scripts, launching the application.

## Project Structure (Key Files)

*   `main.js`: The main Electron process. Handles window creation, IPC communication with the renderer process, and backend logic like interacting with `yt-dlp-wrap` for search and downloads.
*   `renderer.js`: The JavaScript file for the renderer process (front-end). Manages the user interface, DOM manipulation, and sends/receives data to/from `main.js` via the preload script.
*   `preload.js`: Electron preload script that safely exposes specific IPC channels and functionalities from the main process to the renderer process.
*   `index.html`: The main HTML file for the application's user interface.
*   `src/styles/`: Directory containing the CSS files for styling the application.
*   `package.json`: Lists project dependencies, scripts, and metadata.

## Built With

*   [Electron](https://www.electronjs.org/) - Framework for creating native applications with web technologies.
*   [yt-dlp-wrap](https://github.com/yt-dlp-wrap/yt-dlp-wrap) - A Node.js wrapper for the yt-dlp CLI.
*   [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) - Provides a static ffmpeg binary, crucial for audio conversion.
*   [electron-store](https://github.com/sindresorhus/electron-store) - Used for persisting simple data like the download path.
*   HTML, CSS, JavaScript

## How it Works

1.  The user searches for a video in the UI (`index.html` + `renderer.js`).
2.  `renderer.js` sends an IPC message to `main.js` with the search query.
3.  `main.js` uses `yt-dlp-wrap` to execute a search command (`ytsearch...`) and retrieves video metadata (title, URL, duration, thumbnail).
4.  Results are sent back to `renderer.js` and displayed.
5.  The user selects a video and clicks "Download".
6.  `renderer.js` sends an IPC message to `main.js` with the video URL and the chosen download path.
7.  `main.js` uses `yt-dlp-wrap` to download the audio (`-f bestaudio/best`), extract it (`-x`), and convert it to MP3 (`--audio-format mp3`) using `ffmpeg`. The `ffmpeg-static` package provides the necessary `ffmpeg` binary.
8.  Progress updates from `yt-dlp` are relayed to `renderer.js` to update the progress bar.
9.  The `electron-store` module is used to save and retrieve the user's preferred download directory.

## Acknowledgements

*   The developers and community behind `yt-dlp` for the powerful download capabilities.
*   The maintainers of `ffmpeg-static`, `yt-dlp-wrap`, and `electron-store` for these essential Node.js packages.


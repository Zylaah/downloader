const youtubeUrlInput = document.getElementById('youtubeUrl');
const downloadButton = document.getElementById('downloadButton');
const messageArea = document.getElementById('messageArea');
const downloadPathDisplay = document.getElementById('downloadPathDisplay');
const setPathButton = document.getElementById('setPathButton');
const progressContainer = document.getElementById('progressContainer');
const progressBarFill = document.getElementById('progressBarFill');
const progressBarText = document.getElementById('progressBarText');

// Title bar controls
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeRestoreBtn = document.getElementById('maximizeRestoreBtn');
const maximizeIcon = document.getElementById('maximizeIcon');
const restoreIcon = document.getElementById('restoreIcon');
const closeBtn = document.getElementById('closeBtn');

let currentDownloadPath = '';
let messageTimeout = null; // To store the timeout ID for the message area

// Window controls event listeners
if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });
}

if (maximizeRestoreBtn) {
    maximizeRestoreBtn.addEventListener('click', () => {
        window.electronAPI.maximizeRestoreWindow();
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
}

// Listen for main process telling us window is maximized/unmaximized
window.electronAPI.onWindowMaximized(() => {
    maximizeIcon.style.display = 'none';
    restoreIcon.style.display = 'inline'; // Or 'block' / 'flex' depending on SVG styling needs
    maximizeRestoreBtn.title = 'Restore Down';
});

window.electronAPI.onWindowUnmaximized(() => {
    maximizeIcon.style.display = 'inline';
    restoreIcon.style.display = 'none';
    maximizeRestoreBtn.title = 'Maximize';
});

function displayUserMessage(text, type) {
    if (messageTimeout) {
        clearTimeout(messageTimeout);
        // If we clear a timeout, we might want to quickly remove active class 
        // before showing new message, to reset animation if it was in progress.
        messageArea.classList.remove('active');
    }

    messageArea.textContent = text;
    messageArea.className = 'message-area'; // Reset classes to just base (or whatever you call it)
    
    // Re-apply base class and type-specific class
    messageArea.classList.add('message-area'); // Ensure base class is there (if you rename it from just #messageArea ID selector)
    if (type) {
        messageArea.classList.add(`message-${type}`);
    }

    if (text) { // Only proceed to show if there is text
        // Force reflow to ensure animation restarts if classes were just swapped
        // void messageArea.offsetWidth;

        messageArea.classList.add('active');

        messageTimeout = setTimeout(() => {
            messageArea.classList.remove('active');
            // Optional: after animation out, clear text and type class if needed
            // setTimeout(() => { 
            //    if (!messageArea.classList.contains('active')) { // check if another message hasn't immediately come
            //        messageArea.textContent = '';
            //        messageArea.className = 'message-area'; // Reset classes
            //    }
            // }, 400); // Match this to your transition duration for visibility/opacity
        }, 3000); // Message stays for 3 seconds
    } else {
        messageArea.classList.remove('active'); // If no text, ensure it's hidden
    }
}

function updateProgressBar(percentInput) {
    let percentNumber = 0;
    if (typeof percentInput === 'string') {
        percentNumber = parseFloat(percentInput.replace('%', ''));
    } else if (typeof percentInput === 'number') {
        percentNumber = percentInput;
    }

    if (isNaN(percentNumber)) {
        percentNumber = 0;
    }
    percentNumber = Math.max(0, Math.min(100, percentNumber)); // Clamp between 0 and 100

    const widthStyle = `${percentNumber}%`;
    // console.log(`Updating progressBar: textContent to '${Math.round(percentNumber)}%', style.width to '${widthStyle}'`); // Keep for debugging if needed
    progressBarFill.style.width = widthStyle;
    progressBarText.textContent = `${Math.round(percentNumber)}%`;
}

async function initializePath() {
    try {
        const defaultPath = await window.electronAPI.getDefaultDownloadPath();
        if (defaultPath) {
            currentDownloadPath = defaultPath;
            downloadPathDisplay.textContent = defaultPath;
            downloadPathDisplay.title = defaultPath; 
        }
    } catch (error) {
        console.error('Error getting default download path:', error);
        downloadPathDisplay.textContent = 'Could not get default path';
    }
}

function resetListeners() {
    // It's good practice to remove old listeners before adding new ones if this function can be called multiple times
    // or if you want to ensure no duplicate listeners are active.
    window.electronAPI.removeAllListeners('download-progress');
    window.electronAPI.removeAllListeners('download-complete');
    window.electronAPI.removeAllListeners('download-error');
    window.electronAPI.removeAllListeners('download-cancelled');
}

setPathButton.addEventListener('click', async () => {
    try {
        const selectedPath = await window.electronAPI.selectDownloadPath();
        if (selectedPath) {
            currentDownloadPath = selectedPath;
            downloadPathDisplay.textContent = selectedPath;
            downloadPathDisplay.title = selectedPath;
            // No user message here as per previous request
        } else {
            // No user message here
        }
    } catch (error) {
        console.error('Error selecting download path:', error);
        displayUserMessage('Error setting download path.', 'error'); 
    }
});

downloadButton.addEventListener('click', () => {
    let rawUrlValue = youtubeUrlInput.value;
    if (!rawUrlValue || !rawUrlValue.trim()) {
        displayUserMessage('Please enter a YouTube URL.', 'error'); 
        return;
    }

    let urlToDownload = rawUrlValue.trim();
    const markdownLinkRegex = /\((https?:\/\/[^)]+)\)/;
    const match = urlToDownload.match(markdownLinkRegex);
    if (match && match[1]) {
        urlToDownload = match[1];
    }

    if (!urlToDownload.startsWith('http://') && !urlToDownload.startsWith('https://')) {
        displayUserMessage('Invalid URL format. Ensure it starts with http(s)://', 'error');
        return;
    }
    
    if (!currentDownloadPath) {
        displayUserMessage('Please set a download path first.', 'error');
        return;
    }

    resetListeners();
    downloadButton.disabled = true;
    youtubeUrlInput.disabled = true;
    setPathButton.disabled = true;
    progressContainer.style.display = 'block';
    updateProgressBar(0); 
    displayUserMessage('', null); // Clear any existing message immediately

    window.electronAPI.downloadAudio(urlToDownload, currentDownloadPath);

    const reEnableInputsAndHideProgress = () => {
        downloadButton.disabled = false;
        youtubeUrlInput.disabled = false;
        setPathButton.disabled = false;
        progressContainer.style.display = 'none';
    };

    window.electronAPI.onDownloadProgress((progressData) => {
        let percentValueForBar = 0; 
        // let progressTextForMessage = 'Downloading...'; // No longer needed for messageArea

        if (typeof progressData === 'string') {
            // progressTextForMessage = progressData; // No longer needed
            const percentMatch = progressData.match(/(\d+\.?\d*)\s*%/);
            if (percentMatch && percentMatch[1]) {
                percentValueForBar = parseFloat(percentMatch[1]);
            }
        } else if (progressData && typeof progressData === 'object' && progressData.percent != null) {
            if (typeof progressData.percent === 'string'){
                percentValueForBar = parseFloat(progressData.percent.replace('%',''));
            } else if (typeof progressData.percent === 'number'){
                 percentValueForBar = progressData.percent;
            }

            // Constructing progressTextForMessage is no longer needed for displayUserMessage
            // let PctToString = (typeof progressData.percent === 'number') ? progressData.percent.toFixed(1) + '%': progressData.percent;
            // progressTextForMessage = `Downloading: ${PctToString || '0%'}`;
            // if (progressData.totalSize) {
            //     progressTextForMessage += ` of ${progressData.totalSize}`;
            // }
            // if (progressData.currentSpeed) {
            //     progressTextForMessage += ` at ${progressData.currentSpeed}`;
            // }
            // if (progressData.eta) {
            //     progressTextForMessage += `, ETA: ${progressData.eta}`;
            // }
        }
        
        updateProgressBar(percentValueForBar); 
        // displayUserMessage(progressTextForMessage, 'progress'); // REMOVED: This line updated the bottom message area
    });

    window.electronAPI.onDownloadComplete((message) => {
        updateProgressBar(100); // Pass number 100
        displayUserMessage(message, 'complete');
        youtubeUrlInput.value = ''; // Clear input on success
        reEnableInputsAndHideProgress();
        resetListeners(); // Clean up listeners after completion
    });

    window.electronAPI.onDownloadError((errorMessage) => {
        displayUserMessage(errorMessage, 'error');
        reEnableInputsAndHideProgress();
        resetListeners(); // Clean up listeners on error
    });

    window.electronAPI.onDownloadCancelled((message) => {
        // No user message here for cancellation
        reEnableInputsAndHideProgress();
        resetListeners();
    });
});

// Initialize the default path when the script loads
initializePath(); 
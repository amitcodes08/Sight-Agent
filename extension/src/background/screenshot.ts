// ============================================================
// SightAgent — Screenshot Capture
// Orchestrates screenshot capture via chrome.tabs.captureVisibleTab
// and image processing via the Offscreen Document.
// ============================================================

import { MSG, OFFSCREEN_DOCUMENT_PATH } from '../shared/constants';
import type { ImageProcessedMessage } from '../shared/messages';
import { getConfig } from './state';

// Track if an offscreen document currently exists
let offscreenDocumentExists = false;

/**
 * Capture a screenshot of the currently active tab and process it
 * through the offscreen document for resizing and compression.
 *
 * Pipeline:
 * 1. captureVisibleTab() → raw dataURL
 * 2. Ensure offscreen document exists
 * 3. Send dataURL to offscreen for Canvas processing
 * 4. Receive processed base64 back
 *
 * @returns Processed screenshot as base64 string, or null on failure
 */
export async function captureAndProcessScreenshot(): Promise<{
  base64: string;
  width: number;
  height: number;
} | null> {
  try {
    // Step 1: Capture the visible tab
    const dataUrl = await captureVisibleTab();
    if (!dataUrl) return null;

    // Step 2: Ensure offscreen document is ready
    await ensureOffscreenDocument();

    // Step 3: Get config for processing parameters
    const config = await getConfig();

    // Step 4: Send to offscreen document for processing
    const processed = await processInOffscreen(dataUrl, {
      maxWidth: config.screenshotMaxWidth,
      maxHeight: config.screenshotMaxHeight,
      quality: config.screenshotQuality,
    });

    return processed;
  } catch (err) {
    console.error('[SightAgent:BG] Screenshot capture failed:', err);
    return null;
  }
}

/**
 * Capture a screenshot of the currently active tab.
 * Returns a data URL (JPEG format).
 */
async function captureVisibleTab(): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: 'jpeg',
      quality: 85, // Higher quality for the raw capture; offscreen will compress further
    });
    return dataUrl;
  } catch (err) {
    // Common failures: no active tab, tab is a chrome:// URL, etc.
    console.warn('[SightAgent:BG] captureVisibleTab failed:', err);
    return null;
  }
}

/**
 * Ensure the offscreen document exists. Creates it if needed.
 *
 * CRITICAL: Only ONE offscreen document can exist at a time per extension.
 * We must guard creation with a check.
 */
async function ensureOffscreenDocument(): Promise<void> {
  // Fast path: we already know it exists
  if (offscreenDocumentExists) return;

  // Check if any offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenDocumentExists = true;
    return;
  }

  // Create the offscreen document
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Process screenshots via Canvas for resizing and compression',
    });
    offscreenDocumentExists = true;
    console.log('[SightAgent:BG] Offscreen document created');
  } catch (err) {
    // May fail if document already exists (race condition)
    const errorMsg = (err as Error).message || '';
    if (errorMsg.includes('Only a single offscreen')) {
      offscreenDocumentExists = true;
    } else {
      throw err;
    }
  }
}

/**
 * Close the offscreen document to free resources.
 * Call this when monitoring stops or the extension goes idle.
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (!offscreenDocumentExists) return;

  try {
    await chrome.offscreen.closeDocument();
    offscreenDocumentExists = false;
    console.log('[SightAgent:BG] Offscreen document closed');
  } catch {
    // May already be closed
    offscreenDocumentExists = false;
  }
}

/**
 * Send a raw screenshot to the offscreen document for processing
 * and wait for the processed result.
 *
 * Uses a Promise-based message pattern with a one-time listener.
 */
function processInOffscreen(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<{ base64: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    // Set a timeout in case the offscreen document doesn't respond
    const timeoutId = setTimeout(() => {
      console.warn('[SightAgent:BG] Offscreen processing timed out');
      resolve(null);
    }, 10000); // 10 second timeout

    // Create one-time listener for the response
    const listener = (
      message: ImageProcessedMessage,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ): boolean | undefined => {
      if (message.type === MSG.IMAGE_PROCESSED) {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.payload);
      }
      return undefined;
    };

    chrome.runtime.onMessage.addListener(listener);

    // Send the image to the offscreen document
    chrome.runtime.sendMessage({
      type: MSG.PROCESS_IMAGE,
      payload: {
        dataUrl,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        quality: options.quality,
      },
    }).catch((err) => {
      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(listener);
      console.warn('[SightAgent:BG] Failed to send to offscreen:', err);
      resolve(null);
    });
  });
}

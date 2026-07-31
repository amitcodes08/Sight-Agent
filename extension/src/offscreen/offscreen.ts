// ============================================================
// SightAgent — Offscreen Document (Canvas Image Processor)
// Provides DOM/Canvas environment for resizing and compressing
// screenshots captured by the service worker.
//
// Service workers cannot access DOM/Canvas APIs directly.
// This offscreen document bridges that gap.
// ============================================================

import { MSG } from '../shared/constants';

// Get the canvas element from the HTML
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

/**
 * Listen for PROCESS_IMAGE messages from the service worker.
 * Processes the image using Canvas and sends the result back.
 */
chrome.runtime.onMessage.addListener(
  (
    message: {
      type: string;
      payload: {
        dataUrl: string;
        maxWidth: number;
        maxHeight: number;
        quality: number;
      };
    },
    _sender,
    _sendResponse
  ) => {
    if (message.type !== MSG.PROCESS_IMAGE) return;

    const { dataUrl, maxWidth, maxHeight, quality } = message.payload;

    processImage(dataUrl, maxWidth, maxHeight, quality)
      .then((result) => {
        // Send the processed image back to the service worker
        chrome.runtime.sendMessage({
          type: MSG.IMAGE_PROCESSED,
          payload: result,
        });
      })
      .catch((err) => {
        console.error('[SightAgent:Offscreen] Image processing failed:', err);
        // Send null result so the service worker doesn't hang
        chrome.runtime.sendMessage({
          type: MSG.IMAGE_PROCESSED,
          payload: null,
        });
      });

    // Don't call sendResponse — we respond via a separate sendMessage
    return false;
  }
);

/**
 * Process an image by loading it into a Canvas, resizing to fit
 * within maxWidth × maxHeight while maintaining aspect ratio,
 * and exporting as JPEG with the specified quality.
 *
 * @param dataUrl - The raw screenshot data URL from captureVisibleTab
 * @param maxWidth - Maximum output width (default 1280)
 * @param maxHeight - Maximum output height (default 720)
 * @param quality - JPEG quality 0-1 (default 0.7)
 * @returns Object with base64 string (no data URL prefix), width, and height
 */
async function processImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<{ base64: string; width: number; height: number }> {
  // Load the image
  const img = await loadImage(dataUrl);

  // Calculate scaled dimensions maintaining aspect ratio
  let { width, height } = img;

  if (width > maxWidth || height > maxHeight) {
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const scale = Math.min(widthRatio, heightRatio);

    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Resize canvas and draw the image
  canvas.width = width;
  canvas.height = height;

  // Use high-quality interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, width, height);

  // Export as JPEG base64
  const outputDataUrl = canvas.toDataURL('image/jpeg', quality);

  // Strip the "data:image/jpeg;base64," prefix — we only need the raw base64
  const base64 = outputDataUrl.split(',')[1];

  console.log(
    `[SightAgent:Offscreen] Processed: ${img.width}×${img.height} → ${width}×${height}, ` +
    `quality=${quality}, size=${Math.round(base64.length / 1024)}KB`
  );

  return { base64, width, height };
}

/**
 * Load an image from a data URL into an HTMLImageElement.
 * Returns a Promise that resolves when the image is fully loaded.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Image load failed: ${err}`));
    img.src = dataUrl;
  });
}

console.log('[SightAgent:Offscreen] Canvas image processor loaded');

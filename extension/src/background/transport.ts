// ============================================================
// SightAgent — Transport Layer
// HTTP client for sending capture payloads to the backend.
// Features: retry with exponential backoff, LZ-string
// compression for large payloads, offline queue.
// ============================================================

import type { CapturePayload } from '../shared/types';
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  MAX_PENDING_QUEUE_SIZE,
  STORAGE_KEYS,
} from '../shared/constants';
import { getConfig } from './state';

/**
 * Send a capture payload to the backend API.
 *
 * Pipeline:
 * 1. Compress payload if above threshold (via LZ-string)
 * 2. POST to /api/ingest with retry + exponential backoff
 * 3. If all retries fail, queue the payload for later delivery
 *
 * @returns true if the payload was sent (or queued) successfully
 */
export async function sendToBackend(payload: CapturePayload): Promise<boolean> {
  const config = await getConfig();
  const url = `${config.backendUrl}/api/ingest`;

  // Prepare the body — compress if needed
  let body: string;
  let isCompressed = false;

  const rawBody = JSON.stringify(payload);

  if (rawBody.length > config.compressionThreshold) {
    try {
      // Dynamic import to keep the module lightweight when compression isn't needed
      const LZString = await import('lz-string');
      body = JSON.stringify({
        ...payload,
        domSnapshot: LZString.compressToBase64(JSON.stringify(payload.domSnapshot)),
        compressed: true,
      });
      isCompressed = true;
      console.log(
        `[SightAgent:BG] Payload compressed: ${rawBody.length} → ${body.length} bytes`
      );
    } catch {
      // Fallback to uncompressed if LZ-string fails
      body = rawBody;
    }
  } else {
    body = rawBody;
  }

  // Attempt to send with retry
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SightAgent-Version': payload.metadata.extensionVersion,
          ...(isCompressed && { 'X-SightAgent-Compressed': 'lz-string' }),
        },
        body,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[SightAgent:BG] Payload sent successfully:', result);
        return true;
      }

      // Non-retryable status codes
      if (response.status >= 400 && response.status < 500) {
        console.error(
          `[SightAgent:BG] Client error ${response.status}, not retrying:`,
          await response.text()
        );
        return false;
      }

      // Server error — retry
      console.warn(
        `[SightAgent:BG] Server error ${response.status}, attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}`
      );
    } catch (err) {
      console.warn(
        `[SightAgent:BG] Network error, attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}:`,
        err
      );
    }

    // Exponential backoff: 500ms, 1000ms, 2000ms
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries failed — queue the payload for later delivery
  console.warn('[SightAgent:BG] All retries failed, queueing payload');
  await queuePayload(payload);
  return false;
}

/**
 * Queue a payload for later delivery when the backend becomes available.
 * Caps the queue at MAX_PENDING_QUEUE_SIZE to prevent unbounded growth.
 */
async function queuePayload(payload: CapturePayload): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_QUEUE);
    const queue: CapturePayload[] = result[STORAGE_KEYS.PENDING_QUEUE] || [];

    // Remove oldest if queue is full
    while (queue.length >= MAX_PENDING_QUEUE_SIZE) {
      queue.shift();
    }

    // Strip the screenshot to save storage space in the queue
    const queuedPayload = { ...payload, screenshotB64: undefined };
    queue.push(queuedPayload);

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_QUEUE]: queue,
    });

    console.log(`[SightAgent:BG] Payload queued (${queue.length}/${MAX_PENDING_QUEUE_SIZE})`);
  } catch (err) {
    console.error('[SightAgent:BG] Failed to queue payload:', err);
  }
}

/**
 * Attempt to flush any queued payloads to the backend.
 * Called when the backend becomes available again.
 */
export async function flushQueue(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_QUEUE);
    const queue: CapturePayload[] = result[STORAGE_KEYS.PENDING_QUEUE] || [];

    if (queue.length === 0) return;

    console.log(`[SightAgent:BG] Flushing ${queue.length} queued payloads`);

    const config = await getConfig();
    const url = `${config.backendUrl}/api/ingest`;
    const flushed: number[] = [];

    for (let i = 0; i < queue.length; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queue[i]),
        });

        if (response.ok) {
          flushed.push(i);
        } else {
          // Stop flushing on first failure — backend may be going down again
          break;
        }
      } catch {
        break;
      }
    }

    // Remove successfully flushed items
    if (flushed.length > 0) {
      const remaining = queue.filter((_, idx) => !flushed.includes(idx));
      await chrome.storage.local.set({
        [STORAGE_KEYS.PENDING_QUEUE]: remaining,
      });
      console.log(
        `[SightAgent:BG] Flushed ${flushed.length} payloads, ${remaining.length} remaining`
      );
    }
  } catch (err) {
    console.error('[SightAgent:BG] Failed to flush queue:', err);
  }
}

/**
 * Check if the backend is reachable.
 */
export async function checkBackendHealth(): Promise<boolean> {
  const config = await getConfig();
  try {
    const response = await fetch(`${config.backendUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

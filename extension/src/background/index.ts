// ============================================================
// SightAgent — Background Service Worker (Skeleton)
// ============================================================
// CRITICAL: All event listeners MUST be registered synchronously
// at the top level. Never inside async functions or after await.
// ============================================================

import { MSG, ALARM_SCREENSHOT_TICK, DEFAULT_CONFIG, STORAGE_KEYS } from '../shared/constants';
import type { ExtensionMessage } from '../shared/messages';

// ---- Synchronous listener registration (top-level) ----

// Handle messages from content scripts, offscreen doc, and side panel
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case MSG.DOM_SNAPSHOT:
        console.log('[SightAgent:BG] DOM snapshot received:', message.payload.url);
        sendResponse({ ok: true });
        break;

      case MSG.IMAGE_PROCESSED:
        console.log('[SightAgent:BG] Processed image received');
        sendResponse({ ok: true });
        break;

      case MSG.START_MONITORING:
        console.log('[SightAgent:BG] Start monitoring requested');
        sendResponse({ ok: true });
        break;

      case MSG.STOP_MONITORING:
        console.log('[SightAgent:BG] Stop monitoring requested');
        sendResponse({ ok: true });
        break;

      case MSG.GET_STATUS:
        sendResponse({ isMonitoring: false });
        break;

      case MSG.GET_CONFIG:
        chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
          sendResponse(result[STORAGE_KEYS.CONFIG] || DEFAULT_CONFIG);
        });
        return true; // Keep channel open for async response

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
    return false;
  }
);

// Handle periodic alarms for screenshot capture
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_SCREENSHOT_TICK) {
    console.log('[SightAgent:BG] Screenshot alarm tick');
    // Will be implemented in Step 3
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SightAgent:BG] Extension installed/updated:', details.reason);

  // Initialize default config
  const existing = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  if (!existing[STORAGE_KEYS.CONFIG]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: DEFAULT_CONFIG,
    });
    console.log('[SightAgent:BG] Default config initialized');
  }

  // Configure side panel behavior
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

console.log('[SightAgent:BG] Service worker loaded');

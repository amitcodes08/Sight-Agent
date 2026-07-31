// ============================================================
// SightAgent — Background Service Worker (Full Implementation)
// Central orchestrator for the extension.
//
// CRITICAL MV3 CONSTRAINT: All chrome.* event listeners MUST
// be registered synchronously at the top level of this file.
// Never inside async functions or after await calls.
// The service worker can be terminated after ~30s of inactivity.
// ============================================================

import type { DOMSnapshot, UserEvent, CapturePayload, AgentConfig } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';
import { MSG, ALARM_SCREENSHOT_TICK, EXTENSION_VERSION } from '../shared/constants';
import {
  getSessionState,
  setSessionState,
  getConfig,
  setConfig,
  initializeConfig,
} from './state';
import { captureAndProcessScreenshot, closeOffscreenDocument } from './screenshot';
import { sendToBackend, flushQueue, checkBackendHealth } from './transport';

// ============================================================
// TOP-LEVEL SYNCHRONOUS LISTENER REGISTRATION
// These MUST be at the module level — not inside any function.
// ============================================================

// ---- Message Router ----

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    // Route messages to their handler
    handleMessage(message, sender, sendResponse);
    // Return true to keep the message channel open for async responses
    return true;
  }
);

// ---- Alarm Handler ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_SCREENSHOT_TICK) {
    handleScreenshotTick();
  }
});

// ---- Extension Install/Update ----

chrome.runtime.onInstalled.addListener((details) => {
  handleInstalled(details);
});

// ---- Extension Startup (e.g., browser restart) ----

chrome.runtime.onStartup.addListener(() => {
  handleStartup();
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): Promise<void> {
  try {
    switch (message.type) {
      // ---- From Content Script ----

      case MSG.DOM_SNAPSHOT: {
        const snapshot = message.payload as DOMSnapshot;
        await handleDOMSnapshot(snapshot);
        sendResponse({ ok: true });
        break;
      }

      case MSG.USER_EVENT: {
        const event = message.payload as UserEvent;
        await handleUserEvent(event);
        sendResponse({ ok: true });
        break;
      }

      // ---- From Offscreen Document ----
      // IMAGE_PROCESSED is handled by the one-time listener in screenshot.ts

      // ---- From Side Panel ----

      case MSG.START_MONITORING: {
        await startMonitoring();
        sendResponse({ ok: true });
        break;
      }

      case MSG.STOP_MONITORING: {
        await stopMonitoring();
        sendResponse({ ok: true });
        break;
      }

      case MSG.GET_STATUS: {
        const state = await getSessionState();
        sendResponse({
          isMonitoring: state.isMonitoring,
          lastSnapshotTimestamp: state.lastSnapshotTimestamp,
        });
        break;
      }

      case MSG.GET_CONFIG: {
        const config = await getConfig();
        sendResponse(config);
        break;
      }

      case MSG.SET_CONFIG: {
        const updates = message.payload as Partial<AgentConfig>;
        const newConfig = await setConfig(updates);
        sendResponse(newConfig);
        break;
      }

      default:
        sendResponse({ ok: false, error: `Unknown message type: ${(message as { type: string }).type}` });
    }
  } catch (err) {
    console.error('[SightAgent:BG] Message handler error:', err);
    sendResponse({ ok: false, error: String(err) });
  }
}

// ============================================================
// MONITORING LIFECYCLE
// ============================================================

/**
 * Start monitoring: activate alarms, notify content scripts,
 * and update session state.
 */
async function startMonitoring(): Promise<void> {
  const config = await getConfig();

  // Create the periodic screenshot alarm
  // chrome.alarms minimum is 0.5 minutes for production,
  // but in dev we can use a shorter period
  const periodInMinutes = Math.max(config.captureIntervalMs / 60000, 1 / 120);
  await chrome.alarms.create(ALARM_SCREENSHOT_TICK, {
    delayInMinutes: periodInMinutes,
    periodInMinutes,
  });

  // Update session state
  await setSessionState({ isMonitoring: true });

  // Notify all content scripts to start
  await broadcastToContentScripts({ type: MSG.START_MONITORING, payload: undefined });
  await broadcastToContentScripts({
    type: MSG.TOGGLE_OVERLAY,
    payload: { visible: true },
  });

  // Try to flush any queued payloads from a previous session
  const isHealthy = await checkBackendHealth();
  if (isHealthy) {
    flushQueue(); // Fire and forget
  }

  console.log('[SightAgent:BG] Monitoring started (interval:', config.captureIntervalMs, 'ms)');
}

/**
 * Stop monitoring: clear alarms, close offscreen document,
 * notify content scripts, and update session state.
 */
async function stopMonitoring(): Promise<void> {
  // Clear the screenshot alarm
  await chrome.alarms.clear(ALARM_SCREENSHOT_TICK);

  // Close the offscreen document to free resources
  await closeOffscreenDocument();

  // Update session state
  await setSessionState({
    isMonitoring: false,
    pendingSnapshot: null,
    recentEvents: [],
  });

  // Notify all content scripts to stop
  await broadcastToContentScripts({ type: MSG.STOP_MONITORING, payload: undefined });

  console.log('[SightAgent:BG] Monitoring stopped');
}

// ============================================================
// DATA HANDLERS
// ============================================================

/**
 * Handle an incoming DOM snapshot from a content script.
 * Stores it as the pending snapshot — it will be merged with
 * the next screenshot capture and sent to the backend.
 */
async function handleDOMSnapshot(snapshot: DOMSnapshot): Promise<void> {
  const state = await getSessionState();
  if (!state.isMonitoring) return;

  await setSessionState({
    pendingSnapshot: snapshot,
  });

  console.log(
    `[SightAgent:BG] Snapshot buffered: ${snapshot.elements.length} elements from ${snapshot.url}`
  );
}

/**
 * Handle a user event from a content script.
 * Buffers it to be included in the next capture payload.
 */
async function handleUserEvent(event: UserEvent): Promise<void> {
  const state = await getSessionState();
  if (!state.isMonitoring) return;

  const events = [...state.recentEvents, event];

  // Cap at 50 events
  while (events.length > 50) {
    events.shift();
  }

  await setSessionState({ recentEvents: events });
}

/**
 * Handle a screenshot alarm tick.
 * Captures a screenshot, merges it with the pending DOM snapshot,
 * and sends the combined payload to the backend.
 */
async function handleScreenshotTick(): Promise<void> {
  const state = await getSessionState();
  if (!state.isMonitoring) return;

  console.log('[SightAgent:BG] Screenshot tick');

  // Capture and process the screenshot
  const screenshot = await captureAndProcessScreenshot();

  // Get the pending snapshot and events
  const pendingSnapshot = state.pendingSnapshot;
  const recentEvents = state.recentEvents || [];

  // We need at least a snapshot or screenshot to send
  if (!pendingSnapshot && !screenshot) {
    console.log('[SightAgent:BG] No data to send (no snapshot, no screenshot)');
    return;
  }

  // Build the capture payload
  const now = Date.now();

  const payload: CapturePayload = {
    url: pendingSnapshot?.url || 'unknown',
    title: pendingSnapshot?.title || '',
    timestamp: now,
    domSnapshot: pendingSnapshot || {
      url: 'unknown',
      title: '',
      timestamp: now,
      viewport: { width: 0, height: 0 },
      elements: [],
      trigger: 'periodic',
    },
    screenshotB64: screenshot?.base64 || undefined,
    recentEvents: recentEvents,
    compressed: false,
    metadata: {
      extensionVersion: EXTENSION_VERSION,
      userAgent: navigator.userAgent,
      viewport: pendingSnapshot?.viewport || {
        width: screenshot?.width || 0,
        height: screenshot?.height || 0,
      },
      timeSinceLastCapture: state.lastSnapshotTimestamp
        ? now - state.lastSnapshotTimestamp
        : undefined,
    },
  };

  // Clear the pending data
  await setSessionState({
    lastSnapshotTimestamp: now,
    pendingSnapshot: null,
    recentEvents: [],
  });

  // Send to backend (handles retry + queueing internally)
  sendToBackend(payload); // Fire and forget — transport handles errors
}

// ============================================================
// LIFECYCLE HANDLERS
// ============================================================

async function handleInstalled(
  details: chrome.runtime.InstalledDetails
): Promise<void> {
  console.log('[SightAgent:BG] Extension installed/updated:', details.reason);

  // Initialize default config
  await initializeConfig();

  // Configure side panel
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to set panel behavior:', err);
  }
}

async function handleStartup(): Promise<void> {
  console.log('[SightAgent:BG] Browser started, rehydrating state');

  // Check if monitoring was active before browser restart
  const state = await getSessionState();
  if (state.isMonitoring) {
    console.log('[SightAgent:BG] Resuming monitoring from previous session');
    await startMonitoring();
  }
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Broadcast a message to all content scripts in all tabs.
 */
async function broadcastToContentScripts(message: ExtensionMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          // Tab may not have a content script loaded — that's ok
        }
      }
    }
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to broadcast:', err);
  }
}

// ============================================================
// BOOT LOG
// ============================================================

console.log('[SightAgent:BG] Service worker loaded (full implementation)');

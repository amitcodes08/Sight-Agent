// ============================================================
// SightAgent — Content Script Entry Point
// Orchestrates DOM monitoring, event capture, privacy checks,
// and the status overlay. Communicates with the service worker
// via chrome.runtime.sendMessage.
// ============================================================

import type { DOMSnapshot, UserEvent, AgentConfig } from '../shared/types';
import { MSG, DEFAULT_CONFIG, STORAGE_KEYS } from '../shared/constants';
import { sendMessageWithRetry } from '../shared/messages';
import { createDebouncedObserver } from './mutation-observer';
import { createEventListeners } from './event-listeners';
import { buildSnapshot } from './snapshot-builder';
import { isUrlBlocked, scrubPII, getPrivacyConfig } from './privacy';
import { createOverlay } from './shadow-overlay';

// ---- Module State ----

let config: AgentConfig = DEFAULT_CONFIG;
let isMonitoring = false;

// Module instances (created on init, destroyed on teardown)
let observer: ReturnType<typeof createDebouncedObserver> | null = null;
let eventListeners: ReturnType<typeof createEventListeners> | null = null;
let overlay: ReturnType<typeof createOverlay> | null = null;

// User event buffer — accumulated between snapshot sends
let eventBuffer: UserEvent[] = [];
const MAX_EVENT_BUFFER = 50;

// ---- Initialization ----

async function init(): Promise<void> {
  console.log('[SightAgent:CS] Initializing on:', window.location.href);

  // Load config
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    if (result[STORAGE_KEYS.CONFIG]) {
      config = result[STORAGE_KEYS.CONFIG] as AgentConfig;
    }
  } catch (err) {
    console.warn('[SightAgent:CS] Could not load config, using defaults:', err);
  }

  // Check URL blocklist
  const privacyConfig = await getPrivacyConfig();
  if (isUrlBlocked(window.location.href, privacyConfig.urlBlocklist)) {
    console.log('[SightAgent:CS] URL is blocked, skipping initialization');
    return;
  }

  // Create the Shadow DOM overlay (always present, hidden by default)
  overlay = createOverlay();

  // Check if monitoring was active (ask the service worker)
  try {
    const status = await chrome.runtime.sendMessage({ type: MSG.GET_STATUS }) as { isMonitoring: boolean } | undefined;
    if (status?.isMonitoring) {
      startMonitoring();
    }
  } catch {
    // Service worker may not be ready yet — that's ok
    console.log('[SightAgent:CS] Service worker not ready, will wait for message');
  }

  // Listen for commands from the service worker
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);

  // Listen for config changes
  chrome.storage.onChanged.addListener(handleConfigChange);

  console.log('[SightAgent:CS] Initialized successfully');
}

// ---- Message Handlers ----

function handleBackgroundMessage(
  message: { type: string; payload?: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  switch (message.type) {
    case MSG.START_MONITORING:
      startMonitoring();
      sendResponse({ ok: true });
      break;

    case MSG.STOP_MONITORING:
      stopMonitoring();
      sendResponse({ ok: true });
      break;

    case MSG.TOGGLE_OVERLAY: {
      const payload = message.payload as { visible: boolean };
      if (payload.visible) {
        overlay?.show();
      } else {
        overlay?.hide();
      }
      sendResponse({ ok: true });
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }
  return false; // Synchronous response
}

function handleConfigChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string
): void {
  if (areaName !== 'local') return;
  if (changes[STORAGE_KEYS.CONFIG]?.newValue) {
    const newConfig = changes[STORAGE_KEYS.CONFIG].newValue as AgentConfig;
    const wasMonitoring = isMonitoring;

    config = newConfig;
    console.log('[SightAgent:CS] Config updated');

    // If monitoring is active, restart with new config
    if (wasMonitoring) {
      stopMonitoring();
      startMonitoring();
    }
  }
}

// ---- Monitoring Control ----

function startMonitoring(): void {
  if (isMonitoring) return;

  console.log('[SightAgent:CS] Starting monitoring');
  isMonitoring = true;
  eventBuffer = [];

  // Start the MutationObserver
  observer = createDebouncedObserver({
    debounceMs: config.debounceMs,
    maxElements: config.maxElements,
    onSnapshot: handleSnapshot,
  });
  observer.connect();

  // Start event listeners
  eventListeners = createEventListeners({
    onEvent: handleUserEvent,
  });

  // Show the overlay
  overlay?.show();
  overlay?.updateStatus('active');

  // Send an initial snapshot
  const initialSnapshot = buildSnapshot('manual', config.maxElements);
  handleSnapshot(initialSnapshot);
}

function stopMonitoring(): void {
  if (!isMonitoring) return;

  console.log('[SightAgent:CS] Stopping monitoring');
  isMonitoring = false;

  // Stop the MutationObserver
  observer?.disconnect();
  observer = null;

  // Stop event listeners
  eventListeners?.destroy();
  eventListeners = null;

  // Hide the overlay
  overlay?.updateStatus('paused');
  setTimeout(() => overlay?.hide(), 1500); // Show "paused" briefly before hiding

  // Clear event buffer
  eventBuffer = [];
}

// ---- Data Handlers ----

/**
 * Handle a DOM snapshot from the MutationObserver or manual trigger.
 * Applies PII scrubbing, attaches buffered events, and sends to
 * the service worker.
 */
async function handleSnapshot(snapshot: DOMSnapshot): Promise<void> {
  if (!isMonitoring) return;

  // Apply PII scrubbing if enabled
  if (config.piiScrubbing) {
    scrubPII(snapshot);
  }

  // Drain the event buffer
  const events = [...eventBuffer];
  eventBuffer = [];

  // Send to service worker
  try {
    await sendMessageWithRetry({
      type: MSG.DOM_SNAPSHOT,
      payload: snapshot,
    });

    // Also send any buffered user events
    for (const event of events) {
      await sendMessageWithRetry({
        type: MSG.USER_EVENT,
        payload: event,
      });
    }
  } catch (err) {
    console.warn('[SightAgent:CS] Failed to send snapshot:', err);
    overlay?.updateStatus('error', 'connection lost');

    // Try to recover after a delay
    setTimeout(() => {
      if (isMonitoring) {
        overlay?.updateStatus('active');
      }
    }, 5000);
  }
}

/**
 * Handle a user interaction event from the event listeners.
 * Buffers events to be sent with the next DOM snapshot.
 */
function handleUserEvent(event: UserEvent): void {
  if (!isMonitoring) return;

  // Cap the buffer size
  if (eventBuffer.length >= MAX_EVENT_BUFFER) {
    eventBuffer.shift(); // Remove oldest
  }

  eventBuffer.push(event);
}

// ---- Cleanup ----

// Handle page unload
window.addEventListener('beforeunload', () => {
  stopMonitoring();
  overlay?.destroy();
  chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
});

// ---- Bootstrap ----

// Only initialize if we're in a valid browsing context (not an iframe by default)
if (window === window.top) {
  init().catch((err) => {
    console.error('[SightAgent:CS] Initialization failed:', err);
  });
} else {
  console.log('[SightAgent:CS] Skipping iframe:', window.location.href);
}

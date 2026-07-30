// ============================================================
// SightAgent — Shared Constants
// ============================================================

import type { AgentConfig } from './types';

// ---- Message Types ----
// Used as discriminators in chrome.runtime.sendMessage payloads

export const MSG = {
  // Content Script → Background
  DOM_SNAPSHOT: 'DOM_SNAPSHOT',
  USER_EVENT: 'USER_EVENT',

  // Background → Offscreen
  PROCESS_IMAGE: 'PROCESS_IMAGE',

  // Offscreen → Background
  IMAGE_PROCESSED: 'IMAGE_PROCESSED',

  // Side Panel ↔ Background
  START_MONITORING: 'START_MONITORING',
  STOP_MONITORING: 'STOP_MONITORING',
  GET_STATUS: 'GET_STATUS',
  STATUS_UPDATE: 'STATUS_UPDATE',
  GET_CONFIG: 'GET_CONFIG',
  SET_CONFIG: 'SET_CONFIG',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  GET_EVENT_LOG: 'GET_EVENT_LOG',
  EVENT_LOG_ENTRY: 'EVENT_LOG_ENTRY',

  // Background → Content Script
  TOGGLE_OVERLAY: 'TOGGLE_OVERLAY',
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

// ---- Chrome Alarms ----

export const ALARM_SCREENSHOT_TICK = 'sight-agent-screenshot-tick';

// ---- Offscreen Document ----

export const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
export const OFFSCREEN_REASON = 'DISPLAY_MEDIA' as const;

// ---- Default Configuration ----

export const DEFAULT_CONFIG: AgentConfig = {
  backendUrl: 'http://localhost:3001',
  captureIntervalMs: 3000,        // 3 seconds between screenshots
  debounceMs: 300,                 // 300ms MutationObserver debounce
  maxElements: 200,                // Max interactive elements per snapshot
  screenshotQuality: 0.7,          // JPEG quality
  screenshotMaxWidth: 1280,        // Max screenshot width
  screenshotMaxHeight: 720,        // Max screenshot height
  compressionThreshold: 51200,     // 50KB — compress if larger
  urlBlocklist: [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',
    'brave://',
  ],
  piiScrubbing: true,
  autoStart: false,
};

// ---- Storage Keys ----

export const STORAGE_KEYS = {
  CONFIG: 'sight-agent-config',
  SESSION: 'sight-agent-session',
  PENDING_QUEUE: 'sight-agent-pending-queue',
} as const;

// ---- Extension Info ----

export const EXTENSION_VERSION = '0.1.0';

// ---- Transport ----

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 500;
export const MAX_PENDING_QUEUE_SIZE = 10;

// ---- Content Script ----

export const EVENT_THROTTLE_MS = 100;
export const MAX_TEXT_LENGTH = 100;

// ---- Interactive Element Selectors ----
// Elements the snapshot builder will extract from the DOM

export const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[onclick]',
  '[tabindex]',
  'summary',
  'details',
  'label',
].join(', ');

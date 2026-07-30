// ============================================================
// SightAgent — Type-Safe Message Helpers
// ============================================================

import type { DOMSnapshot, UserEvent, AgentConfig, SessionState } from './types';
import { MSG } from './constants';

// ---- Message envelope types ----

export interface MessageEnvelope<T extends string = string, P = unknown> {
  type: T;
  payload: P;
}

// ---- Content Script → Background messages ----

export type DOMSnapshotMessage = MessageEnvelope<typeof MSG.DOM_SNAPSHOT, DOMSnapshot>;
export type UserEventMessage = MessageEnvelope<typeof MSG.USER_EVENT, UserEvent>;

// ---- Background → Offscreen messages ----

export type ProcessImageMessage = MessageEnvelope<
  typeof MSG.PROCESS_IMAGE,
  { dataUrl: string; maxWidth: number; maxHeight: number; quality: number }
>;

// ---- Offscreen → Background messages ----

export type ImageProcessedMessage = MessageEnvelope<
  typeof MSG.IMAGE_PROCESSED,
  { base64: string; width: number; height: number }
>;

// ---- Side Panel ↔ Background messages ----

export type StartMonitoringMessage = MessageEnvelope<typeof MSG.START_MONITORING, undefined>;
export type StopMonitoringMessage = MessageEnvelope<typeof MSG.STOP_MONITORING, undefined>;
export type GetStatusMessage = MessageEnvelope<typeof MSG.GET_STATUS, undefined>;
export type StatusUpdateMessage = MessageEnvelope<typeof MSG.STATUS_UPDATE, SessionState>;
export type GetConfigMessage = MessageEnvelope<typeof MSG.GET_CONFIG, undefined>;
export type SetConfigMessage = MessageEnvelope<typeof MSG.SET_CONFIG, Partial<AgentConfig>>;
export type ConfigUpdatedMessage = MessageEnvelope<typeof MSG.CONFIG_UPDATED, AgentConfig>;

// ---- Background → Content Script messages ----

export type ToggleOverlayMessage = MessageEnvelope<
  typeof MSG.TOGGLE_OVERLAY,
  { visible: boolean }
>;

// ---- Union of all messages ----

export type ExtensionMessage =
  | DOMSnapshotMessage
  | UserEventMessage
  | ProcessImageMessage
  | ImageProcessedMessage
  | StartMonitoringMessage
  | StopMonitoringMessage
  | GetStatusMessage
  | StatusUpdateMessage
  | GetConfigMessage
  | SetConfigMessage
  | ConfigUpdatedMessage
  | ToggleOverlayMessage;

// ---- Helper: send message with retry (content script → background) ----

export async function sendMessageWithRetry<T>(
  message: ExtensionMessage,
  maxRetries = 3
): Promise<T | undefined> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response as T;
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.warn('[SightAgent] Message send failed after retries:', err);
        return undefined;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
    }
  }
  return undefined;
}

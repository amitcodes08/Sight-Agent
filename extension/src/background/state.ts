// ============================================================
// SightAgent — State Manager
// Manages session state via chrome.storage.session (survives
// service worker restarts) and persistent config via
// chrome.storage.local.
// ============================================================

import type { SessionState, AgentConfig } from '../shared/types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '../shared/constants';

// ---- Default Session State ----

const DEFAULT_SESSION: SessionState = {
  isMonitoring: false,
  lastSnapshotTimestamp: 0,
  pendingSnapshot: null,
  recentEvents: [],
};

// ---- Session State (chrome.storage.session) ----
// Survives service worker restarts but clears on browser close.

/**
 * Get the current session state.
 * Returns default values if state hasn't been initialized.
 */
export async function getSessionState(): Promise<SessionState> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.SESSION);
    const state = result[STORAGE_KEYS.SESSION] as SessionState | undefined;
    return state ?? { ...DEFAULT_SESSION };
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to get session state:', err);
    return { ...DEFAULT_SESSION };
  }
}

/**
 * Update session state. Merges partial updates with existing state.
 */
export async function setSessionState(
  updates: Partial<SessionState>
): Promise<SessionState> {
  const current = await getSessionState();
  const updated = { ...current, ...updates };

  try {
    await chrome.storage.session.set({
      [STORAGE_KEYS.SESSION]: updated,
    });
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to set session state:', err);
  }

  return updated;
}

/**
 * Reset session state to defaults.
 */
export async function resetSessionState(): Promise<void> {
  try {
    await chrome.storage.session.set({
      [STORAGE_KEYS.SESSION]: { ...DEFAULT_SESSION },
    });
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to reset session state:', err);
  }
}

// ---- Persistent Config (chrome.storage.local) ----
// Persists across browser restarts.

/**
 * Get the agent configuration.
 * Returns DEFAULT_CONFIG if config hasn't been set.
 */
export async function getConfig(): Promise<AgentConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    const config = result[STORAGE_KEYS.CONFIG] as AgentConfig | undefined;
    return config ?? { ...DEFAULT_CONFIG };
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to get config:', err);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Update the agent configuration. Merges partial updates.
 * Fires a chrome.storage.onChanged event that content scripts listen to.
 */
export async function setConfig(
  updates: Partial<AgentConfig>
): Promise<AgentConfig> {
  const current = await getConfig();
  const updated = { ...current, ...updates };

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: updated,
    });
  } catch (err) {
    console.warn('[SightAgent:BG] Failed to set config:', err);
  }

  return updated;
}

/**
 * Initialize default config if it doesn't exist yet.
 * Called on extension install.
 */
export async function initializeConfig(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  if (!result[STORAGE_KEYS.CONFIG]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: { ...DEFAULT_CONFIG },
    });
    console.log('[SightAgent:BG] Default config initialized');
  }
}

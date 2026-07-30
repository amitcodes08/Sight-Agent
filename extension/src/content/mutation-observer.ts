// ============================================================
// SightAgent — Debounced Mutation Observer
// Watches the DOM for meaningful changes and triggers snapshot
// builds after a configurable quiet period.
// ============================================================

import type { DOMSnapshot } from '../shared/types';
import { buildSnapshot } from './snapshot-builder';

export interface MutationObserverConfig {
  /** Debounce interval in milliseconds */
  debounceMs: number;
  /** Maximum elements per snapshot */
  maxElements: number;
  /** Callback when a debounced snapshot is ready */
  onSnapshot: (snapshot: DOMSnapshot) => void;
}

/**
 * Creates and starts a debounced MutationObserver.
 *
 * The observer watches the entire document body for structural changes
 * (child additions/removals) and filtered attribute changes. Instead of
 * reacting to every mutation, it batches them and only triggers a snapshot
 * build after a configurable quiet period (default 300ms).
 *
 * This prevents flooding the backend on dynamic pages (SPAs, chat apps,
 * infinite scroll) where mutations can fire hundreds of times per second.
 *
 * @returns Object with `disconnect()` to stop observing and `isObserving()` status check
 */
export function createDebouncedObserver(config: MutationObserverConfig) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let mutationCount = 0;
  let observing = false;

  const observer = new MutationObserver((mutations) => {
    // Quick filter: ignore mutations from our own Shadow DOM overlay
    const meaningfulMutations = mutations.filter((m) => {
      const target = m.target as HTMLElement;
      // Skip our own injected elements
      if (target.id === 'sight-agent-root') return false;
      if (target.closest?.('#sight-agent-root')) return false;
      return true;
    });

    if (meaningfulMutations.length === 0) return;

    mutationCount += meaningfulMutations.length;

    // Clear any pending debounce timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    // Set new debounce timer — only build snapshot after quiet period
    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      // Only build snapshot if we had meaningful mutations
      if (mutationCount > 0) {
        const snapshot = buildSnapshot('mutation', config.maxElements);
        config.onSnapshot(snapshot);
        mutationCount = 0;
      }
    }, config.debounceMs);
  });

  /**
   * Start observing the document body.
   * Uses targeted attribute filtering to reduce noise.
   */
  function connect(): void {
    if (observing) return;

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        // Structural/state attributes that indicate meaningful changes
        'class',
        'aria-label',
        'aria-expanded',
        'aria-hidden',
        'aria-checked',
        'aria-selected',
        'aria-disabled',
        'data-state',
        'data-active',
        'data-open',
        'href',
        'src',
        'disabled',
        'hidden',
        'open',
        'checked',
        'value',
      ],
      characterData: false, // Skip text node changes — too noisy
    });

    observing = true;
    console.log('[SightAgent:CS] MutationObserver connected');
  }

  /**
   * Stop observing and clean up timers.
   */
  function disconnect(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    observer.disconnect();
    observing = false;
    mutationCount = 0;
    console.log('[SightAgent:CS] MutationObserver disconnected');
  }

  /**
   * Check if the observer is currently active.
   */
  function isObserving(): boolean {
    return observing;
  }

  return { connect, disconnect, isObserving };
}

// ============================================================
// SightAgent — Event Listeners
// Captures user interactions (clicks, inputs, navigation)
// with throttling to prevent event flooding.
// ============================================================

import type { UserEvent } from '../shared/types';
import { EVENT_THROTTLE_MS, MAX_TEXT_LENGTH } from '../shared/constants';

export interface EventListenerConfig {
  /** Callback when a user event is captured */
  onEvent: (event: UserEvent) => void;
}

/**
 * Sets up throttled event listeners for user interactions.
 *
 * Captures:
 * - click: Button presses, link clicks, any clickable element
 * - input: Text typed into inputs/textareas (debounced)
 * - submit: Form submissions
 * - navigation: URL changes via popstate, hashchange
 * - scroll: Significant scroll position changes (throttled heavily)
 *
 * All listeners are passive where possible to avoid blocking the main thread.
 *
 * @returns Object with `destroy()` to remove all listeners
 */
export function createEventListeners(config: EventListenerConfig) {
  const throttleTimers = new Map<string, number>();
  const controllers: AbortController[] = [];

  /**
   * Throttle wrapper — ensures at most one event of each type
   * is emitted per EVENT_THROTTLE_MS interval.
   */
  function throttledEmit(event: UserEvent): void {
    const key = event.type;
    const now = Date.now();
    const lastEmit = throttleTimers.get(key) || 0;

    if (now - lastEmit < EVENT_THROTTLE_MS) return;

    throttleTimers.set(key, now);
    config.onEvent(event);
  }

  // ---- Click Listener ----
  const clickController = new AbortController();
  controllers.push(clickController);

  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target.id === 'sight-agent-root' || target.closest('#sight-agent-root')) {
        return; // Ignore clicks on our own overlay
      }

      throttledEmit({
        type: 'click',
        timestamp: Date.now(),
        target: {
          tag: target.tagName.toLowerCase(),
          id: target.id || undefined,
          text: (target.textContent?.trim() || '').slice(0, MAX_TEXT_LENGTH),
          xpath: getQuickXPath(target),
        },
        data: {
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
          button: e.button,
        },
      });
    },
    { passive: true, capture: true, signal: clickController.signal }
  );

  // ---- Input Listener (Debounced) ----
  const inputController = new AbortController();
  controllers.push(inputController);
  let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  document.addEventListener(
    'input',
    (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!target || !('value' in target)) return;

      // Debounce input events more aggressively (500ms)
      if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        throttledEmit({
          type: 'input',
          timestamp: Date.now(),
          target: {
            tag: target.tagName.toLowerCase(),
            id: target.id || undefined,
            text: (target.placeholder || '').slice(0, MAX_TEXT_LENGTH),
            xpath: getQuickXPath(target),
          },
          data: {
            // Don't log actual input values for privacy — only metadata
            inputType: target.type || 'text',
            inputName: target.name || undefined,
            hasValue: target.value.length > 0,
            valueLength: target.value.length,
          },
        });
      }, 500);
    },
    { passive: true, capture: true, signal: inputController.signal }
  );

  // ---- Form Submit Listener ----
  const submitController = new AbortController();
  controllers.push(submitController);

  document.addEventListener(
    'submit',
    (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (!form) return;

      throttledEmit({
        type: 'submit',
        timestamp: Date.now(),
        target: {
          tag: 'form',
          id: form.id || undefined,
          text: undefined,
          xpath: getQuickXPath(form),
        },
        data: {
          action: form.action || undefined,
          method: form.method || 'get',
        },
      });
    },
    { passive: true, capture: true, signal: submitController.signal }
  );

  // ---- Navigation Listeners ----
  const navController = new AbortController();
  controllers.push(navController);

  function emitNavigation(): void {
    throttledEmit({
      type: 'navigation',
      timestamp: Date.now(),
      data: {
        url: window.location.href,
        title: document.title,
      },
    });
  }

  window.addEventListener('popstate', emitNavigation, {
    signal: navController.signal,
  });
  window.addEventListener('hashchange', emitNavigation, {
    signal: navController.signal,
  });

  // Intercept pushState/replaceState for SPA navigation detection
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    emitNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    emitNavigation();
  };

  // ---- Scroll Listener (Heavily Throttled) ----
  const scrollController = new AbortController();
  controllers.push(scrollController);
  let lastScrollEmit = 0;

  window.addEventListener(
    'scroll',
    () => {
      const now = Date.now();
      // Only emit scroll events every 2 seconds
      if (now - lastScrollEmit < 2000) return;
      lastScrollEmit = now;

      throttledEmit({
        type: 'scroll',
        timestamp: now,
        data: {
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY),
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          scrollPercentage: Math.round(
            (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
          ),
        },
      });
    },
    { passive: true, signal: scrollController.signal }
  );

  /**
   * Remove all event listeners and clean up.
   */
  function destroy(): void {
    controllers.forEach((c) => c.abort());

    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);

    // Restore original history methods
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    throttleTimers.clear();
    console.log('[SightAgent:CS] Event listeners destroyed');
  }

  return { destroy };
}

/**
 * Quick XPath generator — simplified version for event targets.
 * Returns a short path like "div#main/button" or "form/input[2]".
 */
function getQuickXPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;

  while (current && current !== document.body && depth < 5) {
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`${tag}#${current.id}`);
      break;
    }
    parts.unshift(tag);
    current = current.parentElement;
    depth++;
  }

  return parts.join('/');
}

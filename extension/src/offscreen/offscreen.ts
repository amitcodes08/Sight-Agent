// ============================================================
// SightAgent — Offscreen Document (Skeleton)
// ============================================================
// This document provides DOM/Canvas access for image processing.
// Service workers cannot access DOM APIs directly.
// ============================================================

import { MSG } from '../shared/constants';
import type { ProcessImageMessage } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (message: ProcessImageMessage, _sender, sendResponse) => {
    if (message.type === MSG.PROCESS_IMAGE) {
      console.log('[SightAgent:Offscreen] Image processing requested');
      // Full canvas processing implementation in Step 3
      sendResponse({ ok: true });
    }
    return false;
  }
);

console.log('[SightAgent:Offscreen] Offscreen document loaded');

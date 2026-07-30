// ============================================================
// SightAgent — Snapshot Builder
// Serializes interactive DOM elements into a lightweight JSON
// snapshot suitable for VLM analysis.
// ============================================================

import type { DOMSnapshot, InteractiveElement } from '../shared/types';
import { INTERACTIVE_SELECTORS, MAX_TEXT_LENGTH } from '../shared/constants';

/**
 * Build a lightweight snapshot of the current page's interactive elements.
 * Only captures elements that a user could interact with (links, buttons,
 * inputs, ARIA roles, etc.), keeping the payload small and VLM-focused.
 *
 * @param trigger - What triggered this snapshot
 * @param maxElements - Maximum number of elements to include
 * @returns A DOMSnapshot object ready for transmission
 */
export function buildSnapshot(
  trigger: DOMSnapshot['trigger'],
  maxElements: number
): DOMSnapshot {
  const elements = extractInteractiveElements(maxElements);

  return {
    url: window.location.href,
    title: document.title,
    timestamp: Date.now(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    elements,
    trigger,
  };
}

/**
 * Extract interactive elements from the DOM, sorted by visual position
 * (top-to-bottom, left-to-right) for consistent VLM indexing.
 */
function extractInteractiveElements(maxElements: number): InteractiveElement[] {
  const nodeList = document.querySelectorAll(INTERACTIVE_SELECTORS);
  const elements: InteractiveElement[] = [];

  for (let i = 0; i < nodeList.length && elements.length < maxElements; i++) {
    const el = nodeList[i] as HTMLElement;

    // Skip hidden, zero-size, or off-screen elements
    if (!isVisible(el)) continue;

    const rect = el.getBoundingClientRect();

    // Skip elements entirely outside the viewport
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      continue;
    }

    const element = serializeElement(el, rect, elements.length);
    if (element) {
      elements.push(element);
    }
  }

  // Sort by visual position: top-to-bottom, then left-to-right
  elements.sort((a, b) => {
    const yDiff = a.rect.y - b.rect.y;
    if (Math.abs(yDiff) > 10) return yDiff; // Allow 10px tolerance for same-row
    return a.rect.x - b.rect.x;
  });

  // Re-index after sorting
  elements.forEach((el, idx) => {
    el.index = idx;
  });

  return elements;
}

/**
 * Check if an element is visible (not hidden via CSS or zero-size).
 */
function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && el.tagName !== 'BODY') {
    // offsetParent is null for hidden elements (display: none) or fixed elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    // Fixed/sticky positioned elements have null offsetParent but are visible
    if (style.position !== 'fixed' && style.position !== 'sticky') {
      return false;
    }
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Serialize a single DOM element into our InteractiveElement format.
 */
function serializeElement(
  el: HTMLElement,
  rect: DOMRect,
  index: number
): InteractiveElement | null {
  const tag = el.tagName.toLowerCase();
  const text = getVisibleText(el);

  // Build attributes map — only include relevant ones
  const attributes: Record<string, string> = {};
  const attrNames = [
    'href', 'type', 'name', 'placeholder', 'value',
    'aria-label', 'aria-expanded', 'aria-checked', 'aria-selected',
    'aria-haspopup', 'role', 'title', 'alt', 'data-state',
    'disabled', 'readonly', 'required', 'checked',
  ];

  for (const attr of attrNames) {
    const val = el.getAttribute(attr);
    if (val !== null && val !== '') {
      attributes[attr] = val.slice(0, 200); // Cap attribute length
    }
  }

  // For inputs, capture the current value (not just the HTML attribute)
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (inputEl.value) {
      attributes['value'] = inputEl.value.slice(0, 200);
    }
  }

  return {
    tag,
    id: el.id || undefined,
    classes: el.className && typeof el.className === 'string'
      ? el.className.split(/\s+/).slice(0, 5).join(' ') // Max 5 classes
      : undefined,
    text: text || undefined,
    attributes,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    xpath: getSimpleXPath(el),
    index,
  };
}

/**
 * Get visible text content of an element, truncated to MAX_TEXT_LENGTH.
 * Avoids pulling in text from deeply nested children.
 */
function getVisibleText(el: HTMLElement): string {
  // For inputs, use placeholder or value
  if (el instanceof HTMLInputElement) {
    return (el.value || el.placeholder || '').slice(0, MAX_TEXT_LENGTH);
  }
  if (el instanceof HTMLTextAreaElement) {
    return (el.value || el.placeholder || '').slice(0, MAX_TEXT_LENGTH);
  }
  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex];
    return (selected?.text || '').slice(0, MAX_TEXT_LENGTH);
  }

  // For other elements, get direct text content (not deeply nested)
  const text = el.textContent?.trim() || '';
  return text.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Generate a simplified XPath for an element.
 * Format: /html/body/div[2]/main/button[1]
 */
function getSimpleXPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();

    if (current.id) {
      // If element has an ID, use it as an anchor and stop
      parts.unshift(`//${tag}[@id="${current.id}"]`);
      break;
    }

    // Count preceding siblings with the same tag
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }

    // Only add index if there are multiple siblings with the same tag
    const totalSiblings = current.parentElement
      ? current.parentElement.querySelectorAll(`:scope > ${tag}`).length
      : 1;

    parts.unshift(totalSiblings > 1 ? `${tag}[${index}]` : tag);
    current = current.parentElement;
  }

  return '/' + parts.join('/');
}

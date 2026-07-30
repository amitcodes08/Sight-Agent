// ============================================================
// SightAgent — Privacy Module
// PII scrubbing and URL filtering to ensure sensitive data
// never leaves the browser without the user's consent.
// ============================================================

import type { DOMSnapshot, InteractiveElement } from '../shared/types';
import type { AgentConfig } from '../shared/types';

// ---- PII Regex Patterns ----

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    name: 'phone',
    // Matches common phone formats: +1-234-567-8900, (234) 567-8900, 234.567.8900
    regex: /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)\d{3,4}[-.\s]?\d{4}/g,
  },
  {
    name: 'ssn',
    // US Social Security Number: 123-45-6789
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  },
  {
    name: 'credit-card',
    // Common credit card patterns (Visa, MC, Amex, Discover)
    regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  },
  {
    name: 'ip-address',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
];

/**
 * Check if the current URL is blocked by the user's URL blocklist.
 *
 * @param url - The current page URL
 * @param blocklist - Array of URL prefix patterns to block
 * @returns true if the URL is blocked (should NOT be captured)
 */
export function isUrlBlocked(url: string, blocklist: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  return blocklist.some((pattern) => {
    const lowerPattern = pattern.toLowerCase();
    // Support both prefix matching and regex patterns
    if (lowerPattern.startsWith('/') && lowerPattern.endsWith('/')) {
      try {
        const regex = new RegExp(lowerPattern.slice(1, -1), 'i');
        return regex.test(url);
      } catch {
        return false;
      }
    }
    return lowerUrl.startsWith(lowerPattern);
  });
}

/**
 * Scrub PII from a DOM snapshot. Replaces detected PII patterns
 * with redaction placeholders like [EMAIL_REDACTED].
 *
 * Mutates the snapshot in-place for performance.
 *
 * @param snapshot - The DOM snapshot to scrub
 * @returns The same snapshot object with PII redacted
 */
export function scrubPII(snapshot: DOMSnapshot): DOMSnapshot {
  for (const element of snapshot.elements) {
    scrubElement(element);
  }

  // Also scrub the page title
  snapshot.title = redactString(snapshot.title);

  return snapshot;
}

/**
 * Scrub PII from a single interactive element.
 */
function scrubElement(element: InteractiveElement): void {
  // Scrub visible text
  if (element.text) {
    element.text = redactString(element.text);
  }

  // Scrub attribute values (but not attribute names or structural attrs)
  const sensitiveAttrs = ['value', 'placeholder', 'aria-label', 'title', 'alt'];
  for (const attr of sensitiveAttrs) {
    if (element.attributes[attr]) {
      element.attributes[attr] = redactString(element.attributes[attr]);
    }
  }
}

/**
 * Apply all PII regex patterns to a string, replacing matches
 * with named redaction placeholders.
 */
function redactString(input: string): string {
  let result = input;
  for (const { name, regex } of PII_PATTERNS) {
    // Reset regex lastIndex for global patterns
    regex.lastIndex = 0;
    const placeholder = `[${name.toUpperCase()}_REDACTED]`;
    result = result.replace(regex, placeholder);
  }
  return result;
}

/**
 * Get the effective configuration for privacy checks.
 * Falls back to safe defaults if config is not yet loaded.
 */
export async function getPrivacyConfig(): Promise<Pick<AgentConfig, 'urlBlocklist' | 'piiScrubbing'>> {
  try {
    const result = await chrome.storage.local.get('sight-agent-config');
    const config = result['sight-agent-config'] as AgentConfig | undefined;
    if (config) {
      return {
        urlBlocklist: config.urlBlocklist,
        piiScrubbing: config.piiScrubbing,
      };
    }
  } catch {
    // Content script may not have access to storage in all contexts
  }

  // Safe defaults — block browser-internal URLs, enable PII scrubbing
  return {
    urlBlocklist: [
      'chrome://',
      'chrome-extension://',
      'about:',
      'edge://',
      'brave://',
    ],
    piiScrubbing: true,
  };
}

// ============================================================
// SightAgent — Shared Type Definitions
// ============================================================

/** A single interactive element extracted from the DOM */
export interface InteractiveElement {
  /** HTML tag name (lowercase) */
  tag: string;
  /** Element ID attribute, if present */
  id?: string;
  /** CSS class list */
  classes?: string;
  /** Visible text content (truncated to 100 chars) */
  text?: string;
  /** Relevant attributes (href, aria-label, placeholder, type, name, role, value) */
  attributes: Record<string, string>;
  /** Bounding rectangle relative to viewport */
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Simplified XPath for element identification */
  xpath: string;
  /** Numeric index for VLM element referencing */
  index: number;
}

/** A lightweight snapshot of the current page DOM state */
export interface DOMSnapshot {
  /** Page URL at time of capture */
  url: string;
  /** Page title */
  title: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
  /** Interactive elements on the page */
  elements: InteractiveElement[];
  /** What triggered this snapshot */
  trigger: 'mutation' | 'user-event' | 'periodic' | 'manual';
}

/** User interaction event captured by event listeners */
export interface UserEvent {
  /** Event type */
  type: 'click' | 'input' | 'submit' | 'navigation' | 'scroll';
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Target element metadata */
  target?: {
    tag: string;
    id?: string;
    text?: string;
    xpath: string;
  };
  /** Additional event-specific data */
  data?: Record<string, unknown>;
}

/** Complete payload sent from extension to backend */
export interface CapturePayload {
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Capture timestamp */
  timestamp: number;
  /** DOM snapshot (may be compressed via LZ-string) */
  domSnapshot: DOMSnapshot;
  /** Base64-encoded JPEG screenshot */
  screenshotB64?: string;
  /** Recent user events since last capture */
  recentEvents: UserEvent[];
  /** Whether domSnapshot is LZ-string compressed */
  compressed: boolean;
  /** Metadata about the capture */
  metadata: CaptureMetadata;
}

/** Metadata accompanying a capture payload */
export interface CaptureMetadata {
  /** Extension version */
  extensionVersion: string;
  /** Browser user agent */
  userAgent: string;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
  /** Time since last capture (ms) */
  timeSinceLastCapture?: number;
}

/** Session state persisted in chrome.storage.session */
export interface SessionState {
  /** Whether monitoring is currently active */
  isMonitoring: boolean;
  /** Timestamp of last sent snapshot */
  lastSnapshotTimestamp: number;
  /** Pending DOM snapshot awaiting screenshot merge */
  pendingSnapshot: DOMSnapshot | null;
  /** Recent user events buffer */
  recentEvents: UserEvent[];
}

/** User-configurable settings persisted in chrome.storage.local */
export interface AgentConfig {
  /** Backend API URL */
  backendUrl: string;
  /** Screenshot capture interval in milliseconds */
  captureIntervalMs: number;
  /** DOM mutation debounce interval in milliseconds */
  debounceMs: number;
  /** Maximum elements in a DOM snapshot */
  maxElements: number;
  /** JPEG compression quality (0-1) */
  screenshotQuality: number;
  /** Screenshot max width */
  screenshotMaxWidth: number;
  /** Screenshot max height */
  screenshotMaxHeight: number;
  /** LZ-string compression threshold in bytes */
  compressionThreshold: number;
  /** URL blocklist patterns (regex strings) */
  urlBlocklist: string[];
  /** Whether to enable PII scrubbing */
  piiScrubbing: boolean;
  /** Whether to auto-start monitoring on extension load */
  autoStart: boolean;
}

/** Backend analysis response */
export interface AnalysisResult {
  /** Analysis ID */
  id: string;
  /** Event ID this analysis corresponds to */
  eventId: string;
  /** VLM response text */
  response: string;
  /** Model used */
  model: string;
  /** Token usage */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Analysis timestamp */
  timestamp: number;
}

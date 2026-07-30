// ============================================================
// SightAgent — Shadow DOM Overlay
// Injects a monitoring status indicator into the page using
// a closed Shadow DOM for full CSS/DOM isolation.
// ============================================================

/**
 * Creates the SightAgent monitoring overlay.
 *
 * The overlay is mounted inside a closed Shadow DOM to ensure:
 * 1. The host page's CSS cannot break our indicator
 * 2. Our styles cannot leak into the host page
 * 3. Page scripts cannot access our DOM via element.shadowRoot
 *
 * @returns Object with show(), hide(), updateStatus(), and destroy() methods
 */
export function createOverlay() {
  // Create host element
  const host = document.createElement('div');
  host.id = 'sight-agent-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;';

  // Attach closed Shadow DOM — page scripts cannot access the shadow root
  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject styles and HTML into shadow root
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
      }

      .sight-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: rgba(15, 13, 26, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 24px;
        box-shadow:
          0 4px 24px rgba(0, 0, 0, 0.4),
          0 0 0 1px rgba(99, 102, 241, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: auto;
        cursor: default;
        user-select: none;
      }

      .sight-indicator.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .sight-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6366f1;
        box-shadow: 0 0 8px rgba(99, 102, 241, 0.6);
        animation: sight-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        flex-shrink: 0;
      }

      .sight-dot.paused {
        background: #f59e0b;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
        animation: none;
      }

      .sight-dot.error {
        background: #ef4444;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
        animation: none;
      }

      .sight-label {
        font-size: 12px;
        font-weight: 500;
        color: rgba(226, 232, 240, 0.9);
        letter-spacing: 0.02em;
        white-space: nowrap;
      }

      .sight-label .brand {
        background: linear-gradient(135deg, #6366f1, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-weight: 600;
      }

      @keyframes sight-pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(0.85);
        }
      }
    </style>

    <div class="sight-indicator" id="indicator">
      <div class="sight-dot" id="dot"></div>
      <span class="sight-label">
        <span class="brand">SightAgent</span> monitoring
      </span>
    </div>
  `;

  // Get references to dynamic elements inside shadow
  const indicator = shadow.getElementById('indicator')!;
  const dot = shadow.getElementById('dot')!;
  const label = shadow.querySelector('.sight-label')!;

  let mounted = false;

  /**
   * Mount the overlay into the document and show it.
   */
  function show(): void {
    if (!mounted) {
      document.documentElement.appendChild(host);
      mounted = true;
    }
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      indicator.classList.add('visible');
    });
  }

  /**
   * Hide the overlay with a fade-out animation.
   */
  function hide(): void {
    indicator.classList.remove('visible');
  }

  /**
   * Update the status displayed in the overlay.
   *
   * @param status - 'active' | 'paused' | 'error'
   * @param message - Optional custom message to display
   */
  function updateStatus(
    status: 'active' | 'paused' | 'error',
    message?: string
  ): void {
    // Update dot color/animation
    dot.className = 'sight-dot';
    if (status === 'paused') dot.classList.add('paused');
    if (status === 'error') dot.classList.add('error');

    // Update label text
    const statusText = message || (
      status === 'active' ? 'monitoring' :
      status === 'paused' ? 'paused' :
      'connection error'
    );

    label.innerHTML = `<span class="brand">SightAgent</span> ${statusText}`;
  }

  /**
   * Completely remove the overlay from the DOM.
   */
  function destroy(): void {
    hide();
    // Wait for fade-out animation before removing
    setTimeout(() => {
      if (mounted) {
        host.remove();
        mounted = false;
      }
    }, 300);
  }

  return { show, hide, updateStatus, destroy };
}

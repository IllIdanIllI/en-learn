export interface ClickTarget {
  tag: string;
  label: string | null;
  text: string;
  inSidebar: boolean;
}

/** One line for a click: what was hit, whether it is in the sidebar, the body's pointer-events and whether a dialog is open. */
export function describeClick(target: ClickTarget, bodyPointerEvents: string, dialogOpen: boolean): string {
  const name = (target.label || target.text).replace(/\s+/g, ' ').trim().slice(0, 30);
  return `click ${target.tag.toLowerCase()} "${name}"${target.inSidebar ? ' sidebar' : ''} body=${bodyPointerEvents} dialog=${dialogOpen ? 'yes' : 'no'}`;
}

/** Reports a stall when a 100 ms tick comes more than 200 ms late. */
export function createStallDetector(now: () => number, onStall: (ms: number) => void): { tick(): void; reset(): void } {
  let last = now();
  return {
    tick() {
      const t = now();
      const delay = t - last - 100;
      last = t;
      if (delay > 200) onStall(Math.round(delay));
    },
    reset() {
      last = now();
    },
  };
}

function describeValue(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Starts logging errors, rejections, console.error, stalls, clicks and a flush every second. Runs once per window. */
export function installDebugCapture(win: Window & typeof globalThis, log: (kind: string, text: string) => void, flush: () => void): void {
  const marked = win as Window & { __debugCapture?: boolean };
  if (marked.__debugCapture) return;
  marked.__debugCapture = true;

  win.addEventListener('error', (e: Event) => {
    log('error', String((e as Event & { message?: unknown }).message));
  });
  win.addEventListener('unhandledrejection', (e: Event) => {
    log('rejection', describeValue((e as Event & { reason?: unknown }).reason));
  });

  const original = win.console.error;
  win.console.error = (...args: unknown[]) => {
    try {
      log('console', args.map(describeValue).join(' ').slice(0, 300));
    } catch {
      // Logging must not break the page; the original still runs below.
    }
    original.apply(win.console, args);
  };

  const stall = createStallDetector(
    () => win.performance.now(),
    (ms) => log('stall', `${ms}ms`),
  );
  win.document.addEventListener('visibilitychange', () => stall.reset());
  win.setInterval(() => {
    // A hidden page is throttled, so its gaps are not stalls.
    if (win.document.hidden) stall.reset();
    else stall.tick();
  }, 100);
  win.setInterval(flush, 1000);
  win.addEventListener('pagehide', () => flush());

  win.addEventListener(
    'pointerdown',
    (e: Event) => {
      try {
        const target = e.target;
        if (!(target instanceof win.Element)) return;
        const el = target.closest('a,button,[role],input,textarea,select') ?? target;
        log(
          'click',
          describeClick(
            {
              tag: el.tagName,
              label: el.getAttribute('aria-label'),
              text: el.textContent ?? '',
              inSidebar: el.closest('nav') !== null,
            },
            win.getComputedStyle(win.document.body).pointerEvents,
            win.document.querySelector('[role=dialog]') !== null,
          ),
        );
      } catch {
        // A click the log cannot describe is skipped.
      }
    },
    true,
  );
}

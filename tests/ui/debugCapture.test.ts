import { describe, expect, test, vi } from 'vitest';
import { createStallDetector, describeClick, installDebugCapture } from '@/ui/debug/capture';

// The node environment has no window: a fake one with the few globals capture.ts uses.
function fakeWindow() {
  const timers: Array<() => void> = [];
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const original = vi.fn();
  const con = { error: original };
  const win = Object.assign(new EventTarget(), {
    console: con,
    document: doc,
    performance: { now: () => now },
    setInterval: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
  });
  let now = 0;
  return {
    win: win as unknown as Window & typeof globalThis,
    con,
    doc,
    original,
    timers,
    setNow: (ms: number) => (now = ms),
  };
}

/** A fake element: `closest` answers by the selector's first word, so only `nav` and the clickable list matter here. */
function fakeElement(win: Window & typeof globalThis, over: { tag: string; label?: string | null; text: string; inNav?: boolean; clickable?: boolean; parent?: unknown }) {
  const Element = (win as unknown as { Element: new () => object }).Element;
  const el = new Element() as Record<string, unknown>;
  el.tagName = over.tag;
  el.textContent = over.text;
  el.getAttribute = () => over.label ?? null;
  el.closest = (selector: string) => (selector === 'nav' ? (over.inNav ? {} : null) : over.parent !== undefined ? over.parent : over.clickable === false ? null : el);
  return el;
}

describe('describeClick', () => {
  test('pins the line format, label before text, sidebar and dialog flags', () => {
    expect(describeClick({ tag: 'A', label: 'Слова', text: 'Слова', inSidebar: true }, 'auto', false)).toBe('click a "Слова" sidebar body=auto dialog=no');
  });

  test('uses the text when there is no label, cut to 30 characters', () => {
    expect(describeClick({ tag: 'BUTTON', label: null, text: 'a'.repeat(40), inSidebar: false }, 'none', true)).toBe(`click button "${'a'.repeat(30)}" body=none dialog=yes`);
  });
});

describe('click capture', () => {
  function withDom(pointerEvents: () => string = () => 'auto') {
    const f = fakeWindow();
    class FakeEl {}
    Object.assign(f.win, {
      Element: FakeEl,
      getComputedStyle: () => ({ pointerEvents: pointerEvents() }),
    });
    Object.assign(f.doc, { body: {}, querySelector: () => null });
    const log = vi.fn();
    installDebugCapture(f.win, log, () => {});
    return { ...f, log };
  }
  const fire = (win: Window, type: string, target: unknown) => win.dispatchEvent(Object.defineProperty(new Event(type), 'target', { value: target }));

  test('a target that is not an Element logs nothing', () => {
    const { win, log } = withDom();
    fire(win, 'pointerdown', {});
    expect(log).not.toHaveBeenCalled();
  });

  test('a throwing getComputedStyle is swallowed and nothing is logged', () => {
    const { win, log } = withDom(() => {
      throw new Error('no style');
    });
    const el = fakeElement(win, { tag: 'BUTTON', text: 'Go' });
    expect(() => fire(win, 'pointerdown', el)).not.toThrow();
    expect(log).not.toHaveBeenCalled();
  });

  test('a sidebar link logs the exact click line on pointerdown, and click-done on click', () => {
    const { win, log } = withDom();
    const el = fakeElement(win, { tag: 'A', label: 'Слова', text: 'Слова', inNav: true });
    fire(win, 'pointerdown', el);
    expect(log).toHaveBeenLastCalledWith('click', 'click a "Слова" sidebar body=auto dialog=no');
    fire(win, 'click', el);
    expect(log).toHaveBeenLastCalledWith('click-done', 'click a "Слова" sidebar body=auto dialog=no');
  });

  test('a click outside the sidebar logs only on pointerdown', () => {
    const { win, log } = withDom();
    const el = fakeElement(win, { tag: 'BUTTON', text: 'Go' });
    fire(win, 'click', el);
    expect(log).not.toHaveBeenCalled();
    fire(win, 'pointerdown', el);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('createStallDetector', () => {
  test('ticks 100 ms apart report nothing', () => {
    let now = 0;
    const onStall = vi.fn();
    const detector = createStallDetector(() => now, onStall);
    for (const t of [100, 200, 300]) {
      now = t;
      detector.tick();
    }
    expect(onStall).not.toHaveBeenCalled();
  });

  test('a tick 450 ms after the previous reports the delay over 100 ms', () => {
    let now = 100;
    const onStall = vi.fn();
    const detector = createStallDetector(() => now, onStall);
    now = 550;
    detector.tick();
    expect(onStall).toHaveBeenCalledWith(350);
  });

  test('a 280 ms gap reports nothing', () => {
    let now = 0;
    const onStall = vi.fn();
    const detector = createStallDetector(() => now, onStall);
    now = 280;
    detector.tick();
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe('installDebugCapture', () => {
  test('an error event logs kind error with the message', () => {
    const { win } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    win.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }));
    expect(log).toHaveBeenCalledWith('error', 'boom');
  });

  test('an error event without a message logs unknown error', () => {
    const { win } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    win.dispatchEvent(new Event('error'));
    expect(log).toHaveBeenCalledWith('error', 'unknown error');
  });

  test('an unhandled rejection logs kind rejection with the reason', () => {
    const { win } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    win.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }));
    expect(log).toHaveBeenCalledWith('rejection', 'nope');
  });

  test('console.error logs kind console and still calls the original', () => {
    const { win, con, original } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    con.error('x', 1);
    expect(log).toHaveBeenCalledWith('console', 'x 1');
    expect(original).toHaveBeenCalledWith('x', 1);
  });

  test('console.error text is cut to 300 characters', () => {
    const { win, con } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    con.error('a'.repeat(400));
    expect(String(log.mock.calls[0]?.[1])).toHaveLength(300);
  });

  test('a logging failure does not stop console.error from reaching the console', () => {
    const { win, con, original } = fakeWindow();
    installDebugCapture(
      win,
      () => {
        throw new Error('log broke');
      },
      () => {},
    );
    expect(() => con.error('x')).not.toThrow();
    expect(original).toHaveBeenCalledWith('x');
  });

  test('calling it twice logs one entry per event', () => {
    const { win, con, original } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    installDebugCapture(win, log, () => {});
    win.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }));
    con.error('x');
    expect(log.mock.calls.map((c) => c[0])).toEqual(['error', 'console']);
    expect(original).toHaveBeenCalledTimes(1);
  });

  test('a stall is logged, but a gap while the page is hidden is not', () => {
    const { win, doc, timers, setNow } = fakeWindow();
    const log = vi.fn();
    installDebugCapture(win, log, () => {});
    const stallTick = timers[0] as () => void;
    setNow(900);
    doc.hidden = true;
    stallTick();
    doc.hidden = false;
    setNow(1000);
    stallTick();
    expect(log).not.toHaveBeenCalled();
    setNow(1450);
    stallTick();
    expect(log).toHaveBeenCalledWith('stall', '350ms');
  });
});

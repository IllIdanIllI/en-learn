import { describe, expect, it } from 'vitest';
import { divider, grove, lantern, moon, stalkMeter } from '../../src/ui/grove/sprites';

describe('grove sprites', () => {
  it('grove is deterministic and has the requested size', () => {
    const a = grove(110, 78);
    expect(a).toHaveLength(78);
    expect(a.every((r) => r.length === 110)).toBe(true);
    expect(grove(110, 78)).toEqual(a);
  });

  it('moon phases', () => {
    expect(moon(0).join('')).not.toContain('m');
    const full = moon(0.5);
    expect(full.join('')).not.toContain('E');
    expect(full.join('')).toContain('m');
  });

  it('unlit lantern has no light pixels', () => {
    const rows = lantern(false).join('');
    expect(rows).not.toMatch(/[wm]/);
    expect(lantern(true).join('')).toMatch(/w/);
  });

  it('stalkMeter width', () => {
    const seven = stalkMeter(Array(7).fill('ok'));
    expect(seven.every((r) => r.length === 7 * (9 + 1) + 1)).toBe(true);
    const sixty = stalkMeter(Array(60).fill('empty'));
    expect(sixty[0]!.length).toBeLessThanOrEqual(300);
    const withLeaf = stalkMeter(['ok', 'ok', 'empty'], 30);
    expect(new Set(withLeaf.map((r) => r.length)).size).toBe(1);
  });

  it('stalkMeter never uses red-ish chars', () => {
    expect(stalkMeter(['ok', 'bad', 'empty']).join('')).not.toMatch(/[ros]/);
  });

  it('divider width', () => {
    expect(divider(300).every((r) => r.length === 300)).toBe(true);
  });
});

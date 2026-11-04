import type { CSSProperties } from 'react';
import { moonPhase } from '@/core/moon';
import { useCore } from '@/ui/app/CoreProvider';
import { Pixel } from './Pixel';
import { fence, grove, GETA, lantern, moon, SHOOT } from './sprites';
import { useGarden } from './useGarden';

const COLS = 101; // 202px at scale 2: the nav's 220px less 2 x 8px padding and the 1px border is 203px
const GROVE = grove(COLS, 78);
const FENCE = fence(COLS);
const OUTLINE = 'drop-shadow(2px 0 0 var(--background)) drop-shadow(-2px 0 0 var(--background)) drop-shadow(0 -2px 0 var(--background))';
/** Firefly spots over the grove: left in %, bottom in px. */
const SPOTS: [number, number][] = [[30, 74], [62, 68], [48, 82], [15, 66], [80, 76], [38, 120], [70, 100], [90, 62], [22, 96], [55, 130], [8, 110], [86, 124]];

/** Pixel garden at the foot of the sidebar (Night grove only). Fills the space under the menu, anchored to the bottom, so a short sidebar clips the grove from the top instead of covering the links. */
export function Garden() {
  const { isDark, deps } = useCore();
  const { fireflies, todayClosed } = useGarden();
  const night = isDark;
  const phase = moonPhase(deps.clock.today());
  return (
    <div
      data-garden
      data-night={night}
      aria-hidden="true"
      className="pointer-events-none relative mt-auto hidden min-h-0 flex-1 overflow-hidden min-[1100px]:block"
    >
      {night && (
        <div data-moon className="absolute top-3 left-3">
          <Pixel rows={moon(phase, 7)} />
        </div>
      )}
      <div className="absolute bottom-0 left-0">
        <Pixel rows={GROVE} />
      </div>
      {night &&
        SPOTS.slice(0, fireflies).map(([left, bottom], i) => (
          <span
            key={i}
            data-firefly
            className="grove-firefly"
            style={{ left: `${left}%`, bottom, animationDelay: `${i * 0.7}s` } as CSSProperties}
          />
        ))}
      <div className="absolute bottom-0 left-0">
        <Pixel rows={FENCE} />
      </div>
      <div data-lantern data-lit={night} className="absolute bottom-0 left-1.5 z-10">
        <Pixel rows={lantern(night)} scale={3} />
      </div>
      {todayClosed && (
        <div data-geta className="absolute bottom-0 left-14 z-10 flex gap-[3px]" style={{ filter: OUTLINE }}>
          <Pixel rows={GETA} />
          <Pixel rows={GETA} />
        </div>
      )}
      <div className="absolute right-[52px] bottom-0.5">
        <Pixel rows={SHOOT} />
      </div>
      <div className="absolute right-[30px] bottom-0.5">
        <Pixel rows={SHOOT} />
      </div>
    </div>
  );
}

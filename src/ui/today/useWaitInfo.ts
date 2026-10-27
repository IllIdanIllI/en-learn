import { useEffect, useState } from 'react';
import type { LlmKind } from '@/core/domain';
import { estimateMs } from '@/core/llm/estimate';
import { waitTips, type WaitTip } from '@/core/progress/tips';
import { useCore } from '@/ui/app/CoreProvider';

export const GENERATION_KINDS: LlmKind[] = ['generate_session', 'validate_session'];
export const GRADING_KINDS: LlmKind[] = ['grade'];

/** The estimate and the tips for a job, loaded when it becomes active. Failures leave the loader without them. */
export function useWaitInfo(kinds: LlmKind[], active: boolean): { estimateMs: number | null; tips: WaitTip[] } {
  const { deps } = useCore();
  const [info, setInfo] = useState<{ estimateMs: number | null; tips: WaitTip[] }>({ estimateMs: null, tips: [] });

  useEffect(() => {
    if (!active) return;
    let live = true;
    Promise.all([estimateMs(deps.db, kinds), waitTips(deps.db)]).then(
      ([estimate, tips]) => {
        if (live) setInfo({ estimateMs: estimate, tips });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [active, deps, kinds]);

  return info;
}

import type { Deps, Llm, ProcessRunner } from '@/core/ports';
import type { ClaudeLocation } from '@/core/llm/claude';
import { checkPrerequisites, type PrereqResult } from '@/core/prereq';

/** Reruns the `claude` check; when a location works, the Llm is rebuilt, otherwise deps stay as they are. */
export async function recheck(
  runner: ProcessRunner,
  deps: Deps,
  makeLlm: (location: ClaudeLocation) => Llm,
): Promise<{ prereq: PrereqResult; deps: Deps }> {
  const prereq = await checkPrerequisites(runner);
  return { prereq, deps: prereq.ok ? { ...deps, llm: makeLlm(prereq.location) } : deps };
}

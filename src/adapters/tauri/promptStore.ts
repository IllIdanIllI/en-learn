import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import type { LlmKind } from '@/core/domain';
import type { PromptStore } from '@/core/ports';
import { bundledPrompts, type PromptFiles } from '@/core/llm/bundledPrompts';

/** Uses `<appDataDir>/prompts/<kind>.md` and `.schema.json` when present, falling back per file to the bundled copy. */
export class TauriPromptStore implements PromptStore {
  private readonly cache = new Map<LlmKind, PromptFiles>();

  constructor(private readonly appDataDir: string) {}

  async load(kind: LlmKind): Promise<PromptFiles> {
    const cached = this.cache.get(kind);
    if (cached) return cached;
    const bundled = bundledPrompts[kind];
    const base = `${this.appDataDir}/prompts/${kind}`;
    const loaded: PromptFiles = {
      system: (await this.override(`${base}.md`)) ?? bundled.system,
      schema: parseSchema(await this.override(`${base}.schema.json`), `${base}.schema.json`) ?? bundled.schema,
    };
    this.cache.set(kind, loaded);
    return loaded;
  }

  private async override(path: string): Promise<string | null> {
    try {
      return (await exists(path)) ? await readTextFile(path) : null;
    } catch {
      return null;
    }
  }
}

function parseSchema(text: string | null, path: string): object | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as object;
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

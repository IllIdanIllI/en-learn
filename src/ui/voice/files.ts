import type { SpellingVariant } from '@/ui/words/speech';

// The Kokoro model and voices, pinned to one Hugging Face revision so the files never change under the app.
export const VOICE_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';

/** Every file the model needs, with its exact size (checked after download). */
export const VOICE_FILES: { path: string; size: number }[] = [
  { path: 'onnx/model_quantized.onnx', size: 92361116 },
  { path: 'config.json', size: 44 },
  { path: 'tokenizer.json', size: 3497 },
  { path: 'tokenizer_config.json', size: 113 },
  { path: 'voices/bf_emma.bin', size: 522240 },
  { path: 'voices/af_heart.bin', size: 522240 },
];

export const voiceUrl = (path: string) =>
  `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${VOICE_REVISION}/${path}`;

export const VOICE_BY_VARIANT = { 'en-GB': 'bf_emma', 'en-US': 'af_heart' } as const satisfies Record<SpellingVariant, string>;

import { afterEach, expect, test, vi } from 'vitest';

const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
const native = proto[Symbol.asyncIterator];

afterEach(() => {
  proto[Symbol.asyncIterator] = native;
  vi.resetModules();
});

const stream = () =>
  new ReadableStream<number>({
    start(controller) {
      controller.enqueue(1);
      controller.enqueue(2);
      controller.close();
    },
  });

test('a stream can be read with for await where the browser lacks it', async () => {
  delete proto[Symbol.asyncIterator];
  await import('@/ui/voice/streamIteration');
  const chunks: number[] = [];
  for await (const chunk of stream() as unknown as AsyncIterable<number>) chunks.push(chunk);
  expect(chunks).toEqual([1, 2]);
});

test('the browser\'s own iteration is left alone', async () => {
  await import('@/ui/voice/streamIteration');
  expect(proto[Symbol.asyncIterator]).toBe(native);
});

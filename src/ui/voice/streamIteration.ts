// `for await (const chunk of stream)` for WebKit versions without it. The phonemizer inside kokoro-js unpacks its
// data that way when it is loaded; without this it fails silently there and every synthesis waits forever.
// Imported for its side effect, before kokoro-js.
type Iterable = { [Symbol.asyncIterator]?: () => AsyncGenerator<unknown> };

if (!(Symbol.asyncIterator in ReadableStream.prototype)) {
  (ReadableStream.prototype as Iterable)[Symbol.asyncIterator] = async function* (this: ReadableStream<unknown>) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

export {};

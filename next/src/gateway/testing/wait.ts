/** Read until `done` accepts the value, or fail with the last value seen. */
export async function eventually<T>(
  read: () => Promise<T> | T,
  done: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`Gave up after ${timeoutMs} ms; the last value was ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

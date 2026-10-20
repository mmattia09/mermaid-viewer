/** Serialize work, but skip queued preview requests superseded before they start.
 * Export tasks use a separate queue and must never be dropped.
 */
export function latestTask(run) {
  let revision = 0;
  let tail = Promise.resolve();
  return {
    request(value) {
      const ticket = ++revision;
      const current = () => ticket === revision;
      const result = tail.then(() => current() ? run(value, current) : undefined);
      tail = result.catch(() => {});
      return result;
    },
    invalidate() { revision++; },
  };
}

/** Concurrent consumers share one load; a failure can be retried. */
export function lazyScript(src, resolveValue, errorMessage) {
  let pending;
  return () => pending ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(resolveValue());
    script.onerror = () => {
      pending = undefined;
      script.remove();
      reject(new Error(errorMessage()));
    };
    document.head.append(script);
  });
}

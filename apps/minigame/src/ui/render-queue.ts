/** Merge input bursts into one native frame, retaining the latest state at paint time. */
export function createRenderQueue(requestFrame: ((callback: () => void) => unknown) | undefined, paint: (reuseContent: boolean) => void) {
  let pending = false, reuse = true, generation = 0;
  const cancel = () => { generation++; pending = false; reuse = true; };
  const flush = (reuseContent = true) => {
    const nextReuse = reuse && reuseContent;
    cancel();
    paint(nextReuse);
  };
  const request = (reuseContent = true) => {
    reuse = reuse && reuseContent;
    if (pending) return;
    if (!requestFrame) { flush(); return; }
    pending = true;
    const token = ++generation;
    requestFrame(() => { if (token === generation) flush(); });
  };
  return { request, flush, cancel };
}

export function afterTwoFrames(
  ready: () => void,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (id: number) => void,
): () => void {
  let active = true;
  let frame = requestFrame(() => {
    if (!active) return;
    frame = requestFrame(() => {
      if (active) ready();
    });
  });
  return () => {
    active = false;
    cancelFrame(frame);
  };
}

interface CanvasImage {
  width: number;
  height: number;
}
interface CanvasContext {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(
    image: CanvasImage,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}
interface Canvas {
  getContext(type: '2d'): CanvasContext;
  encode(format: 'png'): Promise<Uint8Array>;
}
interface CanvasModule {
  createCanvas(width: number, height: number): Canvas;
  loadImage(source: Uint8Array): Promise<CanvasImage>;
}

export interface Band {
  top: number;
  bottom: number;
}

/**
 * 2단 조판 쪽을 단 사이 여백(gutter)에서 좌우로 잘라 각각 PNG 로 만든다.
 * 전체 폭 줄(제목·소제목)이 있던 높이 구간은 하얗게 지워 반쪽 글자가 인식되지 않게 한다.
 * 이미지 라이브러리를 쓸 수 없으면 undefined.
 */
export async function cropColumns(
  image: Uint8Array,
  gutter: number,
  bands: readonly Band[],
): Promise<{ left: Uint8Array; right: Uint8Array } | undefined> {
  const loaded = (await import('@napi-rs/canvas').catch(() => undefined)) as unknown as
    (CanvasModule & { default?: CanvasModule }) | undefined;
  const canvasModule = loaded?.default ?? loaded;
  if (!canvasModule?.createCanvas) return undefined;
  const source = await canvasModule.loadImage(image);
  const x = Math.max(1, Math.min(source.width - 1, Math.round(gutter)));
  const cut = async (from: number, width: number): Promise<Uint8Array> => {
    const canvas = canvasModule.createCanvas(width, source.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, source.height);
    context.drawImage(source, from, 0, width, source.height, 0, 0, width, source.height);
    for (const band of bands)
      context.fillRect(0, Math.max(0, band.top - 2), width, band.bottom - band.top + 4);
    return canvas.encode('png');
  };
  return { left: await cut(0, x), right: await cut(x, source.width - x) };
}

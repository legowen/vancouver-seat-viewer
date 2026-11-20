import { CanvasTexture, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { seededRandom } from '../scene/random';

// Every texture is drawn on a canvas at runtime: the app ships no image or model files.

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  return { canvas, context };
}

function toTexture(canvas: HTMLCanvasElement, repeat = false): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** Adds a little grain so flat surfaces read as fabric rather than plastic. */
function addGrain(context: CanvasRenderingContext2D, size: number, amount: number, seed: number) {
  const random = seededRandom(seed);
  const image = context.getImageData(0, 0, size, size);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const delta = (random() - 0.5) * amount;
    data[index] = (data[index] ?? 0) + delta;
    data[index + 1] = (data[index + 1] ?? 0) + delta;
    data[index + 2] = (data[index + 2] ?? 0) + delta;
  }
  context.putImageData(image, 0, 0);
}

/** White radial falloff, tinted by the material colour. Used for fake pools of light. */
export function glowTexture(): CanvasTexture {
  const size = 128;
  const { canvas, context } = makeCanvas(size, size);
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/** Acoustic wall panels with grooves between them. One tile is 2.4 m square. */
export function wallTexture(): CanvasTexture {
  const size = 256;
  const { canvas, context } = makeCanvas(size, size);
  const shades = ['#dadada', '#d0d0d0', '#d6d6d6', '#cbcbcb'];
  shades.forEach((shade, index) => {
    context.fillStyle = shade;
    context.fillRect(index * 64, 0, 64, size);
  });
  context.fillStyle = '#6e6e6e';
  for (let index = 0; index < 4; index++) context.fillRect(index * 64, 0, 3, size);
  context.fillRect(0, 126, size, 2);
  addGrain(context, size, 18, 7);
  return toTexture(canvas, true);
}

/** Dark carpet speckle. One tile is 1.5 m square. */
export function carpetTexture(): CanvasTexture {
  const size = 128;
  const { canvas, context } = makeCanvas(size, size);
  context.fillStyle = '#d0d0d0';
  context.fillRect(0, 0, size, size);
  addGrain(context, size, 70, 11);
  return toTexture(canvas, true);
}

/** The screen before anything plays: an even, slightly cool projector glow. */
export function screenIdleTexture(): CanvasTexture {
  const width = 512;
  const height = 214;
  const { canvas, context } = makeCanvas(width, height);
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.1,
    width / 2,
    height / 2,
    width * 0.62,
  );
  gradient.addColorStop(0, '#dfe5f5');
  gradient.addColorStop(0.6, '#b8c3de');
  gradient.addColorStop(1, '#7d8aab');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  return toTexture(canvas);
}

/** A green EXIT sign. */
export function exitSignTexture(): CanvasTexture {
  const { canvas, context } = makeCanvas(128, 48);
  context.fillStyle = '#0d8f3f';
  context.fillRect(0, 0, 128, 48);
  context.fillStyle = '#f4fff6';
  context.font = 'bold 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('EXIT', 64, 26);
  return toTexture(canvas);
}

/** YouTube's still frame for a video. Resolves to null when it cannot be loaded with CORS. */
export function loadPosterTexture(videoId: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        // hqdefault is 4:3 with black bars above and below a 16:9 frame. Show only the frame.
        texture.repeat.set(1, 0.75);
        texture.offset.set(0, 0.125);
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/**
 * The still frame on the screen before the trailer plays: the video's YouTube thumbnail,
 * letterboxed to the screen's shape. Loaded with CORS so it may be used as a WebGL texture;
 * when that fails (offline, blocked, no CORS) the caller keeps the plain glowing screen.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';
import { thumbnailUrl } from '../youtube/url';

/** hqdefault.jpg is 480×360 with black bars around a 16:9 picture. */
const SOURCE = { width: 480, height: 360, pictureTop: 45, pictureHeight: 270 };
const VIDEO_ASPECT = 16 / 9;

export function loadImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    function finish(result: HTMLImageElement | null) {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    }
    image.onload = () => finish(image.naturalWidth > 0 ? image : null);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

/**
 * Draws the 16:9 picture of a thumbnail onto a canvas shaped like the screen: centred with black
 * side bars on a wide screen ("fit"), or cropped top and bottom to fill it ("fill").
 */
export function screenCanvas(
  image: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number },
  screenAspect: number,
  mode: 'fit' | 'fill' = 'fit',
): HTMLCanvasElement {
  const width = 1024;
  const height = Math.round(width / screenAspect);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  const scaleX = (image.naturalWidth || SOURCE.width) / SOURCE.width;
  const scaleY = (image.naturalHeight || SOURCE.height) / SOURCE.height;
  let sx = 0;
  let sy = SOURCE.pictureTop * scaleY;
  let sw = SOURCE.width * scaleX;
  let sh = SOURCE.pictureHeight * scaleY;
  let dw = height * VIDEO_ASPECT;
  let dh = height;
  if (mode === 'fill' || dw > width) {
    // Fill the width and crop the picture's top and bottom to the screen's shape.
    dw = width;
    dh = height;
    const keep = VIDEO_ASPECT / screenAspect;
    sy += (sh * (1 - keep)) / 2;
    sh *= keep;
    if (keep > 1) {
      // A screen taller than 16:9: crop the sides instead.
      sh /= keep;
      sy = SOURCE.pictureTop * scaleY;
      const keepX = screenAspect / VIDEO_ASPECT;
      sx = (sw * (1 - keepX)) / 2;
      sw *= keepX;
    }
  }
  context.drawImage(image, sx, sy, sw, sh, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return canvas;
}

export async function loadScreenTexture(
  videoId: string,
  screenAspect: number,
  mode: 'fit' | 'fill' = 'fit',
): Promise<CanvasTexture | null> {
  const image = await loadImage(thumbnailUrl(videoId));
  if (!image) return null;
  try {
    const texture = new CanvasTexture(screenCanvas(image, screenAspect, mode));
    texture.colorSpace = SRGBColorSpace;
    return texture;
  } catch {
    // A tainted canvas (no CORS) cannot be uploaded to WebGL.
    return null;
  }
}

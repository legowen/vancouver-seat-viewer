/** Small textures drawn on a canvas at start-up, so the app ships no image files. */
import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

function canvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** White in the middle fading to transparent: tinted by the material colour for light pools. */
export function glowTexture(): CanvasTexture {
  const size = 128;
  const texture = canvasTexture(size, size, (context) => {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

/** A soft-edged rectangle, for the light the screen throws on the wall around it. */
export function haloTexture(): CanvasTexture {
  const width = 256;
  const height = 128;
  const texture = canvasTexture(width, height, (context) => {
    context.filter = 'blur(14px)';
    context.fillStyle = 'rgba(255,255,255,0.9)';
    context.fillRect(width * 0.14, height * 0.16, width * 0.72, height * 0.68);
  });
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

/** Fabric wall panels: soft vertical bands with a dark groove between them. Repeats sideways. */
export function panelTexture(light: string, dark: string): CanvasTexture {
  const width = 64;
  const height = 8;
  const texture = canvasTexture(width, height, (context) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, dark);
    gradient.addColorStop(0.08, light);
    gradient.addColorStop(0.5, light);
    gradient.addColorStop(0.92, light);
    gradient.addColorStop(1, dark);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** CSS colour string for a hex number, for drawing on a canvas. */
export function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

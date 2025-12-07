import { ChromaKeySettings, DEFAULT_CHROMA_KEY_SETTINGS } from '../types';

// Convert hex color to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 0, g: 255, b: 0 }; // Default green
}

// Convert RGB to hex
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Calculate color distance (Euclidean distance in RGB space)
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
}

// Apply chroma key to image data in place
export function applyChromaKey(
  imageData: ImageData,
  settings: ChromaKeySettings
): void {
  if (!settings.enabled) return;
  
  const keyColor = hexToRgb(settings.keyColor);
  const data = imageData.data;
  
  // Tolerance: 0-100 maps to 0-255 color distance threshold
  const toleranceThreshold = (settings.tolerance / 100) * 255;
  // Edge softness: controls the feathering range
  const softnessRange = (settings.edgeSoftness / 100) * 100;
  // Spill suppression strength
  const spillStrength = settings.spillSuppression / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const distance = colorDistance(r, g, b, keyColor.r, keyColor.g, keyColor.b);
    
    if (distance < toleranceThreshold) {
      // Within tolerance - make transparent
      const alpha = softnessRange > 0
        ? Math.min(255, Math.max(0, (distance / toleranceThreshold) * 255 * (1 + softnessRange / 50)))
        : 0;
      data[i + 3] = alpha;
    } else if (softnessRange > 0 && distance < toleranceThreshold + softnessRange) {
      // Edge feathering zone
      const blend = (distance - toleranceThreshold) / softnessRange;
      data[i + 3] = Math.round(blend * 255);
    }
    
    // Spill suppression - reduce green tint on non-keyed pixels
    if (spillStrength > 0 && data[i + 3] > 0) {
      // Check if this pixel has a green tint
      const greenExcess = g - Math.max(r, b);
      if (greenExcess > 0) {
        // Reduce green channel proportionally
        data[i + 1] = Math.round(g - greenExcess * spillStrength * 0.7);
      }
    }
  }
}

// Sample color from image at specific coordinates
export function sampleColorFromImage(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  x: number,
  y: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageElement instanceof HTMLVideoElement ? imageElement.videoWidth : imageElement.width;
  canvas.height = imageElement instanceof HTMLVideoElement ? imageElement.videoHeight : imageElement.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#00FF00';
  
  ctx.drawImage(imageElement, 0, 0);
  
  // Scale coordinates to canvas size
  const scaleX = canvas.width / (imageElement instanceof HTMLVideoElement ? imageElement.clientWidth : imageElement.width);
  const scaleY = canvas.height / (imageElement instanceof HTMLVideoElement ? imageElement.clientHeight : imageElement.height);
  
  const sampleX = Math.round(x * scaleX);
  const sampleY = Math.round(y * scaleY);
  
  const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
  return rgbToHex(pixel[0], pixel[1], pixel[2]);
}

// Create a processed canvas from an image/video with chroma key applied
export function createChromaKeyCanvas(
  source: HTMLImageElement | HTMLVideoElement,
  settings: ChromaKeySettings
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth || source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight || source.height;
  
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  ctx.drawImage(source, 0, 0, width, height);
  
  if (settings.enabled) {
    const imageData = ctx.getImageData(0, 0, width, height);
    applyChromaKey(imageData, settings);
    ctx.putImageData(imageData, 0, 0);
  }
  
  return canvas;
}

// Get default settings
export function getDefaultChromaKeySettings(): ChromaKeySettings {
  return { ...DEFAULT_CHROMA_KEY_SETTINGS };
}


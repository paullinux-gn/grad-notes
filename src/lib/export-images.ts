/** Images for exported documents: any format the app shows, as PNG bytes. */

export interface ExportedImage {
  bytes: Uint8Array;
  /** Natural size in CSS pixels. */
  width: number;
  height: number;
}

/** Loads an image and redraws it as PNG (Word can't show SVG or WebP alone). */
export function exportImage(src: string): Promise<ExportedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      // SVGs without a size report 0; give them a sensible one.
      const width = img.naturalWidth || 640;
      const height = img.naturalHeight || 480;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return resolve(null);
          resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width, height });
        }, 'image/png');
      } catch {
        // A tainted canvas (image from elsewhere without CORS): leave it out.
        resolve(null);
      }
    };
    img.src = src;
  });
}

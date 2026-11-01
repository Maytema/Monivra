/* Photos attached to operations: shrink a picked image to a small JPEG data URL */

const LONG_SIDE = 800;
const QUALITY = 0.75;

// Decode an image from memory: the decoder of the canvas first, an <img> element if it refuses.
async function decode(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Read the file (any format the browser can open, orientation applied) and redraw it smaller.
// The bytes are read first: a file handed over by a picker can only be read at that moment.
export async function photoDataUrl(file) {
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const image = await decode(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, LONG_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

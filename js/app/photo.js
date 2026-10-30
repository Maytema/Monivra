/* Photos attached to operations: shrink a picked image to a small JPEG data URL */

const LONG_SIDE = 800;
const QUALITY = 0.75;

// Decode the file (any format the browser can open, orientation applied) and redraw it smaller.
export async function photoDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

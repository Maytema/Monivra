/* Photos attached to operations: shrink a picked image to a small JPEG data URL */

const LONG_SIDE = 800;
const QUALITY = 0.75;
// Major brands of HEIF files; browsers cannot open them (AVIF files are told apart by their brand).
const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

// A photo that cannot be used; the message is meant for the person.
export class PhotoError extends Error {}

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

const isHeif = (bytes) =>
  ascii(bytes, 4, 8) === "ftyp" && HEIF_BRANDS.includes(ascii(bytes, 8, 12));

// Read the file (any format the browser can open, orientation applied) and redraw it smaller.
// The bytes are read first: a file from a picker is a handle that the system may stop serving
// while the image is still being decoded from it.
export async function photoDataUrl(file) {
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (cause) {
    throw new PhotoError("The photo could not be read", { cause });
  }
  // A photo that lives only in the cloud reaches the page empty or cut short.
  if (!buffer.byteLength || buffer.byteLength < file.size)
    throw new PhotoError("The photo is not fully on the phone. Download it first");
  if (isHeif(new Uint8Array(buffer)))
    throw new PhotoError("This photo format is not supported. Choose a JPEG or PNG photo");
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }));
  } catch (cause) {
    throw new PhotoError("This photo is damaged and cannot be opened", { cause });
  }
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

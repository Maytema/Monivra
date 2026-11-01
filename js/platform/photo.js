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

// Decode as the browser shows images: a picture whose data stops early (some phones leave the
// end of a screenshot out) is drawn as far as it goes, where `createImageBitmap` refuses it.
async function decodeImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch (cause) {
    throw new PhotoError("This photo is damaged and cannot be opened", { cause });
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const image = await decodeImage(new Blob([buffer], { type: file.type }));
  const scale = Math.min(1, LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

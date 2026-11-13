// What may be attached to an operation as a photo, and what can go wrong (js/platform/photo.js plus the limits
// the owner asked for): only pictures of a few formats, and not heavy ones. The native module checks the file
// itself (its real format, not its name) and answers with one of the codes below; the screen turns the problem
// into words for the person.
export const PHOTO_FORMATS = "JPEG, PNG, WebP";
export const MAX_PHOTO_MB = 15;
export const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;
// The picker only offers these types; the module checks them again, since a file can be called anything.
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoProblem = "format" | "size" | "damaged" | "unreadable" | "cloud";

export class PhotoError extends Error {
  readonly problem: PhotoProblem;
  constructor(problem: PhotoProblem) {
    super(`photo: ${problem}`);
    this.problem = problem;
  }
}

const CODES: ReadonlyArray<readonly [string, PhotoProblem]> = [
  ["PHOTO_FORMAT", "format"],
  ["PHOTO_SIZE", "size"],
  ["PHOTO_DAMAGED", "damaged"],
];

// Whatever failed while the photo was read becomes a PhotoError (the native module's message arrives wrapped
// in other text, so the code is looked for inside it).
export function toPhotoError(error: unknown): PhotoError {
  if (error instanceof PhotoError) return error;
  const text = error instanceof Error ? error.message : String(error);
  return new PhotoError(CODES.find(([code]) => text.includes(code))?.[1] ?? "unreadable");
}

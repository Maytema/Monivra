/* Files, sharing and printing, in a browser and in the Android shell.
   Three different things, never mixed up: saving writes the file, sharing opens the share sheet of
   the device with the file attached, printing opens the print dialog. Sharing never saves.
   In the Android shell the same functions use the system document picker (save), the system share
   sheet (a content address of the file, never a path) and the system print service (the PDF itself). */
import { native, toBase64 } from "./native.js";

// A file ready to be saved or shared. `content` is text or bytes.
export const makeFile = (name, content, type) =>
  new File([content], name, { type: type.split(";")[0] });

// The file as the native bridge takes it.
const nativeFile = async (file) => ({
  name: file.name,
  mime: file.type || "application/octet-stream",
  data: await toBase64(file),
});

// Writes the file where the person chooses (the system "save as" screen in the Android shell, the
// downloads of the browser otherwise). A second tap on the same file within a second is the same
// request and is ignored. Resolves with
//   "saved"     the file was written,
//   "cancelled" the person closed the save screen; nothing was written,
//   "busy"      the same request is already going on; nothing was done,
//   "failed"    the file could not be written.
let lastSave = { key: "", at: 0 };
export async function saveFile(file) {
  const now = Date.now();
  const key = `${file.name}|${file.size}`;
  if (lastSave.key === key && now - lastSave.at < 1000) return "busy";
  lastSave = { key, at: now };
  if (native) {
    try {
      const { status } = await native.saveDocument(await nativeFile(file));
      return status === "saved" ? "saved" : "cancelled";
    } catch (error) {
      console.error("Saving failed:", error?.message);
      return "failed";
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "saved";
}

// Opens the system file chooser; resolves with the chosen file, or null when it is dismissed.
export function pickFile({ accept, camera = false }) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (camera) input.capture = "environment";
    input.hidden = true;
    const finish = (file) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.append(input);
    input.click();
  });
}

// True when the browser can hand this file to the share sheet of the device.
export const canShareFile = (file) =>
  Boolean(native) || Boolean(navigator.canShare?.({ files: [file] }));

// Offers the file to the share sheet. Resolves with
//   "shared"      the person finished sharing,
//   "cancelled"   the person closed the sheet,
//   "unsupported" this browser cannot share files; nothing was done,
//   "blocked"     the browser wants a fresh tap (the file took too long to prepare); nothing was done,
//   "failed"      the sheet could not be opened,
//   "busy"        a share sheet is already open; nothing was done.
// A file is never saved by this function: the caller offers saving as a visible choice.
// A second tap while the sheet is being opened is the same request. A sheet that never reports back
// (some browsers leave the promise open after the person picked an app) must not block later taps, so
// only a tap within a moment of the last one is a repeat.
let shareStartedAt = 0;
export async function shareFile(file) {
  if (Date.now() - shareStartedAt < 1500) return "busy";
  if (!canShareFile(file)) return "unsupported";
  shareStartedAt = Date.now();
  if (native) {
    try {
      // Android does not tell what the person did in the share sheet; "shared" means it was opened.
      await native.shareDocument(await nativeFile(file));
      return "shared";
    } catch (error) {
      console.error("Sharing failed:", error?.message);
      return "failed";
    } finally {
      shareStartedAt = Math.min(shareStartedAt, Date.now() - 1500);
    }
  }
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    if (error.name === "NotAllowedError") return "blocked";
    if (error.name === "InvalidStateError") return "busy"; // a sheet is already open
    console.error("Sharing failed:", error);
    return "failed";
  } finally {
    shareStartedAt = Math.min(shareStartedAt, Date.now() - 1500); // free again once it has answered
  }
}

// Opens the print dialog with the pictures of the pages, one page of paper each. There is one print
// frame at most: asking again while one is open does nothing. Resolves when the dialog is closed (or
// after half a minute, so that nothing stays waiting for a browser that never says).
let printFrame = null;
let nativePrinting = false;
export async function printPages(urls, file = null) {
  // The Android shell prints the PDF itself, so the text stays text; a second tap while the print
  // screen is being opened is the same request.
  if (native && file?.type === "application/pdf") {
    if (nativePrinting) return;
    nativePrinting = true;
    try {
      await native.printPdf(await nativeFile(file));
    } finally {
      nativePrinting = false;
    }
    return;
  }
  if (printFrame) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(frame);
  printFrame = frame;
  const doc = frame.contentDocument;
  doc.open();
  doc.write(
    `<!doctype html><title></title><style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style>${urls.map((url) => `<img src="${url}">`).join("")}`,
  );
  doc.close();
  const images = [...doc.images];
  const ready = Promise.all(
    images.map((image) =>
      image.complete ? 1 : new Promise((done) => image.addEventListener("load", done)),
    ),
  );
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      frame.remove();
      if (printFrame === frame) printFrame = null;
      done();
    };
    const timer = setTimeout(finish, 30000);
    ready.then(() => {
      if (printFrame !== frame) return;
      frame.contentWindow.addEventListener("afterprint", finish);
      frame.contentWindow.focus();
      frame.contentWindow.print();
    });
  });
}

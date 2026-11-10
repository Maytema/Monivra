/* Files, sharing and printing as the browser offers them; a native shell would replace this module.
   Three different things, never mixed up: saving writes the file, sharing opens the share sheet of
   the device with the file attached, printing opens the print dialog. Sharing never saves. */

// A file ready to be saved or shared. `content` is text or bytes.
export const makeFile = (name, content, type) =>
  new File([content], name, { type: type.split(";")[0] });

// Writes the file into the downloads of the device. A second tap on the same file within a second
// is the same request and is ignored.
let lastSave = { key: "", at: 0 };
export function saveFile(file) {
  const now = Date.now();
  const key = `${file.name}|${file.size}`;
  if (lastSave.key === key && now - lastSave.at < 1000) return;
  lastSave = { key, at: now };
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
export const canShareFile = (file) => Boolean(navigator.canShare?.({ files: [file] }));

// Offers the file to the share sheet. Resolves with
//   "shared"      the person finished sharing,
//   "cancelled"   the person closed the sheet,
//   "unsupported" this browser cannot share files; nothing was done,
//   "blocked"     the browser wants a fresh tap (the file took too long to prepare); nothing was done,
//   "failed"      the sheet could not be opened,
//   "busy"        a share sheet is already open; nothing was done.
// A file is never saved by this function: the caller offers saving as a visible choice.
let sharing = false;
export async function shareFile(file) {
  if (sharing) return "busy";
  if (!canShareFile(file)) return "unsupported";
  sharing = true;
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    if (error.name === "NotAllowedError") return "blocked";
    console.error("Sharing failed:", error);
    return "failed";
  } finally {
    sharing = false;
  }
}

// Opens the print dialog with the pictures of the pages, one page of paper each. There is one print
// frame at most: asking again while one is open does nothing. Resolves when the dialog is closed (or
// after half a minute, so that nothing stays waiting for a browser that never says).
let printFrame = null;
export function printPages(urls) {
  if (printFrame) return Promise.resolve();
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

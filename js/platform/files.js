/* Files, sharing and printing as the browser offers them; a native shell would replace this module.
   Three different things, never mixed up: saving writes the file, sharing opens the share sheet of
   the device with the file attached, printing opens the print dialog. Sharing never saves. */

// A file ready to be saved or shared. `content` is text or bytes.
export const makeFile = (name, content, type) =>
  new File([content], name, { type: type.split(";")[0] });

// Writes the file into the downloads of the device.
export function saveFile(file) {
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
//   "failed"      the sheet could not be opened.
// A file is never saved by this function: the caller offers saving as a visible choice.
export async function shareFile(file) {
  if (!canShareFile(file)) return "unsupported";
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    if (error.name === "NotAllowedError") return "blocked";
    console.error("Sharing failed:", error);
    return "failed";
  }
}

// Opens the print dialog with the pictures of the pages, one page of paper each.
export function printPages(urls) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(frame);
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
  ready.then(() => {
    frame.contentWindow.addEventListener("afterprint", () => frame.remove());
    frame.contentWindow.focus();
    frame.contentWindow.print();
  });
}

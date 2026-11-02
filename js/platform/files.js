/* Files and printing as the browser offers them; a native shell would replace this module. */

export function saveTextFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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

export function printHtml(html) {
  document.getElementById("printout").innerHTML = html;
  window.print();
}

// Offers a file to the share sheet of the device; where sharing files is not possible the file is
// saved instead. Resolves with false when the person dismissed the sheet.
export async function shareTextFile(name, content, type) {
  const file = new File([content], name, { type });
  if (!navigator.canShare?.({ files: [file] })) {
    saveTextFile(name, content, type);
    return true;
  }
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (error) {
    if (error.name === "AbortError") return false;
    saveTextFile(name, content, type);
    return true;
  }
}

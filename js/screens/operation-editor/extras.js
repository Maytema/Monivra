/* Comment, tags and photos of the operation being edited */
import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg, MAX_PHOTOS } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { pickFile } from "../../platform/files.js";
import { photoDataUrl } from "../../platform/photo.js";
import { translate, translateWith } from "../../i18n/index.js";
import { confirmAction, popupMenu, promptText } from "../../ui/dialogs.js";
import { registerAction } from "../../ui/handlers.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { buttonHtml, iconButtonHtml, menuRowHtml, toast } from "../../ui/primitives.js";

// Sheet for choosing tags of an operation: several can be picked, "+ Add" creates a new one.
function tagsPicker(draft) {
  let chosen = [...(draft.tags || [])];
  const addTag = () =>
    promptText(
      "New tag",
      "",
      (value) => {
        const name = value.trim();
        if (!name) return toast("Enter a tag");
        if (!appData.tags.includes(name)) appData.tags.push(name);
        if (!chosen.includes(name)) chosen.push(name);
        save();
        render();
      },
      "Tag name",
    );
  const toggle = (tag) => {
    chosen = chosen.includes(tag) ? chosen.filter((x) => x !== tag) : [...chosen, tag];
    render();
  };
  const tagMenu = (tag) =>
    registerAction((chip) =>
      popupMenu(chip, [
        ["Edit", () => renameTag(tag, chosen)],
        ["Delete", () => deleteTag(tag, chosen)],
      ]),
    );
  openSheet(
    () =>
      `<h2>${translate("Select tags")}</h2><div class="tag-cloud tag-picker">${appData.tags
        .map((tag) =>
          buttonHtml(
            escapeHtml(tag),
            () => toggle(tag),
            "tag " + (chosen.includes(tag) ? "active" : ""),
            `data-hold="${tagMenu(tag)}"`,
          ),
        )
        .join(
          "",
        )}${buttonHtml(`${iconSvg("plus", 14)} ${translate("Add")}`, addTag, "tag tag-add")}</div>${buttonHtml(
        "Complete",
        () => {
          draft.tags = chosen.filter((tag) => appData.tags.includes(tag));
          closeLayers();
          render();
        },
        "primary",
      )}`,
    "Select tags",
  );
}

// Rename a tag everywhere (`chosen` is the selection of the open picker).
function renameTag(tag, chosen) {
  promptText(
    "Rename tag",
    tag,
    (value) => {
      const name = value.trim();
      if (!name) return toast("Enter a tag");
      if (name !== tag && appData.tags.includes(name)) return toast("Tag already exists");
      appData.tags = appData.tags.map((t) => (t === tag ? name : t));
      for (const key of ["ops", "scheduled"])
        for (const op of appData[key]) op.tags = (op.tags || []).map((t) => (t === tag ? name : t));
      const i = chosen.indexOf(tag);
      if (i >= 0) chosen[i] = name;
      save();
      render();
    },
    "Name",
  );
}

// Remove a tag from the list and from all operations.
function deleteTag(tag, chosen) {
  confirmAction(
    "Remove this tag from all operations?",
    () => {
      appData.tags = appData.tags.filter((t) => t !== tag);
      for (const key of ["ops", "scheduled"])
        for (const op of appData[key]) op.tags = (op.tags || []).filter((t) => t !== tag);
      const i = chosen.indexOf(tag);
      if (i >= 0) chosen.splice(i, 1);
      save();
      render();
    },
    true,
    "Delete",
  );
}

// Let the person pick or take a photo and attach it to the operation.
async function choosePhoto(draft, camera) {
  const file = await pickFile({ accept: "image/*", camera });
  if (!file) return;
  try {
    draft.photos.push(await photoDataUrl(file));
  } catch (error) {
    console.error("Photo failed:", error);
    // The format and the kind of failure tell an unreadable file from an unsupported format.
    toast(`${translate("This image could not be opened")} (${file.type || "?"}, ${error.name})`);
    return;
  }
  closeLayers();
  // The row of photos grows the editor: bring it, with the buttons above it, into view.
  document.querySelector(".calc-extras")?.scrollIntoView({ block: "nearest" });
  toast("Photo attached");
}

// Menu for attaching a photo.
function photoMenu(draft) {
  if (draft.photos.length >= MAX_PHOTOS)
    return toast(translateWith("No more than {n} photos", { n: MAX_PHOTOS }));
  openSheet(
    () =>
      `<h2>${translate("Add photo")}</h2><div class="photo-menu">${menuRowHtml("Take a photo", "camera", () => choosePhoto(draft, true))}${menuRowHtml("Choose from gallery", "image", () => choosePhoto(draft, false))}</div>`,
    "Add photo",
  );
}

// Full-screen view of an attached photo.
function photoViewer(src) {
  openSheet(
    () =>
      `<div class="photo-viewer" data-action="${registerAction(() => closeLayers())}">${iconButtonHtml("close", "Close", () => closeLayers())}<img alt="Photo" src="${escapeHtml(src)}"></div>`,
    "Photo",
    "full",
  );
}

function photosHtml(draft) {
  if (!draft.photos.length) return "";
  const removePhoto = (index) => {
    draft.photos.splice(index, 1);
    render();
  };
  return `<div class="calc-photos">${draft.photos
    .map(
      (src, i) =>
        `<span class="calc-photo">${buttonHtml(`<img alt="" src="${escapeHtml(src)}">`, () => photoViewer(src), "calc-photo-open", 'aria-label="Open photo"')}${iconButtonHtml("close", "Remove photo", () => removePhoto(i))}</span>`,
    )
    .join("")}</div>`;
}

// Comment, photos and tags of the operation.
export function extrasHtml(draft) {
  const editComment = () =>
    promptText(
      "Comment",
      draft.comment,
      (value) => {
        draft.comment = value;
        render();
      },
      "Comment",
    );
  const clearComment = () => {
    draft.comment = "";
    render();
  };
  const comment = draft.comment
    ? `<div class="calc-comment">${buttonHtml(escapeHtml(draft.comment), editComment, "calc-comment-text", 'aria-label="Comment"')}${iconButtonHtml("close", "Clear comment", clearComment)}</div>`
    : "";
  const tags = draft.tags?.length
    ? buttonHtml(
        draft.tags.map((x) => `<span class="tag-chip">${escapeHtml(x)}</span>`).join(""),
        () => tagsPicker(draft),
        "calc-tags",
        'aria-label="Tags"',
      )
    : "";
  return `<div class="calc-extras">${comment}<div class="calc-attachments">${buttonHtml(iconSvg("clip", 27), () => photoMenu(draft), "icon-button", 'aria-label="Attachment"')}${iconButtonHtml("comment", "Comment", editComment)}${iconButtonHtml("tag", "Tags", () => tagsPicker(draft))}</div>${tags}${photosHtml(draft)}</div>`;
}

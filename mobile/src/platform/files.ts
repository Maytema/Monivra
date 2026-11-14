// Files the person picks or shares: the data file for moving data between the applications.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { now, perfLog } from "./perf.ts";
import * as Sharing from "expo-sharing";

// The text of a file the person picks, or null when they cancel.
export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return new File(asset.uri).text();
}

// The name and text of a file the person picks, or null when they cancel.
export async function pickFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "text/csv", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const started = now();
  const text = await new File(asset.uri).text();
  perfLog(`file read: ${text.length} characters`, now() - started);
  return { name: asset.name, text };
}

// The bytes of a file the person picks (a table to import, read in the encoding they choose).
export async function pickFileBytes(): Promise<{ name: string; size: number; bytes: Uint8Array } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  return { name: asset.name, size: file.size ?? asset.size ?? 0, bytes: await file.bytes() };
}

// Saves a file in a folder the person chooses (the system's folder picker). False when they cancel.
export async function saveTextFile(name: string, text: string | Uint8Array, mimeType = "application/json"): Promise<boolean> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  if (!folder) return false;
  const file = folder.createFile(name, mimeType);
  // Awaited: from SDK 58 the write finishes later (a promise), so returning at once would report a file that
  // is not all there yet.
  await file.write(text);
  return true;
}

// Writes a file to the cache and opens the system share sheet ("Save to Files", Drive, mail…).
export async function shareTextFile(name: string, text: string | Uint8Array, mimeType = "application/json"): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

// Files the person picks or shares: the data file for moving data between the applications.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
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
  return { name: asset.name, text: await new File(asset.uri).text() };
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
  file.write(text);
  return true;
}

// Writes a file to the cache and opens the system share sheet ("Save to Files", Drive, mail…).
export async function shareTextFile(name: string, text: string | Uint8Array, mimeType = "application/json"): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

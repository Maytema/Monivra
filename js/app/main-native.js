/* The entry of the Android shell (the browser uses main.js). The data is read when the state module is
   first loaded, so the shell is asked first for what the data needs (the internal copy of the data
   when the stored data is gone, the PIN verifier) and the rest of the application is loaded after.
   The Android build puts this file in the place of main.js in index.html; nothing else differs. */
import { prepareNative } from "../platform/native-boot.js";

await prepareNative();
const { startup } = await import("./startup.js");
startup();

// Secure random bytes for new identifiers (Web Crypto is not built into React Native).
import { getRandomValues } from "expo-crypto";

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto?.getRandomValues) g.crypto = { ...(g.crypto ?? {}), getRandomValues };

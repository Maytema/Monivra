// The network as the rate sources see it.
import type { Fetcher } from "../services/rates/providers.ts";

export const fetcher: Fetcher = async (url, { signal, headers }) => {
  const response = await fetch(url, { signal, headers: headers ?? {} });
  return { ok: response.ok, status: response.status, text: () => response.text() };
};

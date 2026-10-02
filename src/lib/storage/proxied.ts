import "server-only";
import { storageDriverName } from "./index";
import { openLocalStream, writeLocalStream } from "./local";
import { openR2Stream, writeR2Stream } from "./r2";

/** Driver yang file-nya disajikan/diterima lewat route aplikasi (local, r2), bukan URL langsung ke CDN. */
export const isProxiedDriver = () => {
  const d = storageDriverName();
  return d === "local" || d === "r2";
};

export const openStream = (key: string) => (storageDriverName() === "r2" ? openR2Stream(key) : openLocalStream(key));

export const writeStream = (key: string, body: ReadableStream<Uint8Array>, maxBytes: number, length?: number) =>
  storageDriverName() === "r2" ? writeR2Stream(key, body, maxBytes, length) : writeLocalStream(key, body, maxBytes);

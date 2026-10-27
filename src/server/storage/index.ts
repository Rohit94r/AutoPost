import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sign, verifySignature } from "@/server/crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { storedFileChunks } from "@/server/db/schema";
import { env, storageDriver, storageProblem } from "@/server/env";
import { AppError } from "@/server/errors";

/**
 * Private object storage. Objects are never public by default; access goes through
 * authorised routes or short-lived signed URLs.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** A URL an external platform (e.g. Instagram) can fetch for `ttlSec` seconds. */
  publicUrl(key: string, ttlSec: number): Promise<string>;
  /** Streamed read: serverless hosts cap buffered responses (Vercel: 4.5 MB), streams aren't capped. */
  stream(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number | null }>;
  /** Object size in bytes, or null if it doesn't exist. */
  size(key: string): Promise<number | null>;
  /**
   * Browser-to-storage upload URL (PUT), so large files skip the app server's request-size limit.
   * Null when the driver can't do it (local disk): the browser then posts the file to the app.
   */
  directUploadUrl(key: string, contentType: string, ttlSec: number): Promise<string | null>;
  /** Chunked uploads through the app (database storage): store part `index` of an object. */
  appendChunk?(key: string, index: number, data: Buffer): Promise<void>;
}

/** Signed URL on the app's own domain (served by /api/public-media) for drivers without public URLs. */
function signedAppUrl(key: string, ttlSec: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const url = new URL(`/api/public-media`, env().APP_BASE_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sign(`${key}:${exp}`));
  return url.toString();
}

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async stream(key: string) {
    const full = this.resolve(key);
    const { size } = await stat(full);
    return { body: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>, size };
  }

  async size(key: string) {
    return stat(this.resolve(key)).then((s) => s.size, () => null);
  }

  async directUploadUrl() {
    return null;
  }

  async publicUrl(key: string, ttlSec: number) {
    return signedAppUrl(key, ttlSec);
  }
}

class S3Storage implements StorageDriver {
  private readonly client: S3Client;
  constructor(private readonly bucket: string) {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: undefined }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty object");
    return Buffer.from(bytes);
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async stream(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object");
    return { body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>, size: res.ContentLength ?? null };
  }

  async size(key: string) {
    try {
      return (await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength ?? null;
    } catch {
      return null;
    }
  }

  directUploadUrl(key: string, contentType: string, ttlSec: number) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: ttlSec });
  }

  publicUrl(key: string, ttlSec: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec });
  }
}

/** Files stored in Postgres as ordered chunks (≤ 4 MB each), streamed back chunk by chunk. */
export class DatabaseStorage implements StorageDriver {
  static readonly CHUNK = 4 * 1024 * 1024;

  async put(key: string, data: Buffer, contentType: string) {
    await db.transaction(async (tx) => {
      await tx.delete(storedFileChunks).where(eq(storedFileChunks.key, key));
      for (let i = 0, idx = 0; i < Math.max(data.length, 1); i += DatabaseStorage.CHUNK, idx++) {
        await tx.insert(storedFileChunks).values({ key, idx, data: data.subarray(i, i + DatabaseStorage.CHUNK), contentType });
      }
    });
  }

  async get(key: string) {
    const rows = await db.select({ data: storedFileChunks.data }).from(storedFileChunks).where(eq(storedFileChunks.key, key)).orderBy(asc(storedFileChunks.idx));
    if (!rows.length) throw new Error("Object not found");
    return Buffer.concat(rows.map((r) => r.data));
  }

  async delete(key: string) {
    await db.delete(storedFileChunks).where(eq(storedFileChunks.key, key));
  }

  async size(key: string) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int`, bytes: sql<string | null>`sum(octet_length(${storedFileChunks.data}))::text` })
      .from(storedFileChunks)
      .where(eq(storedFileChunks.key, key));
    return r && r.n > 0 ? Number(r.bytes) : null;
  }

  async stream(key: string) {
    const parts = await db.select({ idx: storedFileChunks.idx }).from(storedFileChunks).where(eq(storedFileChunks.key, key)).orderBy(asc(storedFileChunks.idx));
    if (!parts.length) throw new Error("Object not found");
    const size = await this.size(key);
    let i = 0;
    // One chunk per pull, so memory stays at one chunk however large the file is.
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (i >= parts.length) return controller.close();
        const [row] = await db.select({ data: storedFileChunks.data }).from(storedFileChunks).where(and(eq(storedFileChunks.key, key), eq(storedFileChunks.idx, parts[i++]!.idx)));
        controller.enqueue(new Uint8Array(row!.data));
      },
    });
    return { body, size };
  }

  async publicUrl(key: string, ttlSec: number) {
    return signedAppUrl(key, ttlSec);
  }

  async directUploadUrl() {
    return null;
  }

  async appendChunk(key: string, index: number, data: Buffer) {
    await db
      .insert(storedFileChunks)
      .values({ key, idx: index, data })
      .onConflictDoUpdate({ target: [storedFileChunks.key, storedFileChunks.idx], set: { data } });
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  const problem = storageProblem();
  if (problem) throw new AppError(503, "storage_not_configured", problem);
  const kind = storageDriver();
  if (kind === "s3") {
    driver = new S3Storage(e.S3_BUCKET!);
  } else if (kind === "database") {
    driver = new DatabaseStorage();
  } else {
    driver = new LocalStorage(path.resolve(e.STORAGE_LOCAL_DIR));
  }
  return driver;
}

export function setStorageForTesting(d: StorageDriver | undefined) {
  driver = d;
}

export function verifyLocalPublicUrl(key: string, exp: string, sig: string) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return false;
  return verifySignature(`${key}:${exp}`, sig);
}

export const storageKey = (workspaceId: string, kind: "media" | "documents" | "thumbs" | "uploads", ext: string) =>
  `${kind}/${workspaceId}/${crypto.randomUUID()}${ext ? `.${ext.replace(/^\./, "")}` : ""}`;

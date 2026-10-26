import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sign, verifySignature } from "@/server/crypto";
import { env } from "@/server/env";

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

  async publicUrl(key: string, ttlSec: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = sign(`${key}:${exp}`);
    const url = new URL(`/api/public-media`, env().APP_BASE_URL);
    url.searchParams.set("key", key);
    url.searchParams.set("exp", String(exp));
    url.searchParams.set("sig", sig);
    return url.toString();
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

  publicUrl(key: string, ttlSec: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec });
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    if (!e.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    driver = new S3Storage(e.S3_BUCKET);
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

export const storageKey = (workspaceId: string, kind: "media" | "documents" | "thumbs", ext: string) =>
  `${kind}/${workspaceId}/${crypto.randomUUID()}${ext ? `.${ext.replace(/^\./, "")}` : ""}`;

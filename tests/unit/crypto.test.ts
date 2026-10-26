import { describe, expect, it } from "vitest";
import { decrypt, encrypt, sign, verifySignature } from "@/server/crypto";
import { resetEnvCache } from "@/server/env";

describe("AES-256-GCM token encryption", () => {
  it("round-trips and produces unique ciphertexts", () => {
    const a = encrypt("secret-token");
    const b = encrypt("secret-token");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("secret-token");
    expect(decrypt(a)).toBe("secret-token");
  });

  it("detects tampering", () => {
    const parts = encrypt("hello").split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("decrypts with the previous key during rotation", () => {
    const old = encrypt("rotating");
    const original = process.env.ENCRYPTION_KEY!;
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.ENCRYPTION_KEY_PREVIOUS = original;
    resetEnvCache();
    try {
      expect(decrypt(old)).toBe("rotating");
      expect(decrypt(encrypt("new"))).toBe("new");
    } finally {
      process.env.ENCRYPTION_KEY = original;
      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      resetEnvCache();
    }
  });

  it("rejects values encrypted with an unknown key", () => {
    const v = encrypt("x");
    const original = process.env.ENCRYPTION_KEY!;
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    resetEnvCache();
    try {
      expect(() => decrypt(v)).toThrow(/No encryption key/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
      resetEnvCache();
    }
  });

  it("signs and verifies", () => {
    const s = sign("media/x:123");
    expect(verifySignature("media/x:123", s)).toBe(true);
    expect(verifySignature("media/y:123", s)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/server/env";

/** Every value in .env.example must pass validation, so copying it never breaks startup. */
function parseEnvFile(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe(".env.example", () => {
  it("validates with only the required secrets filled in", () => {
    const vars = parseEnvFile(readFileSync(".env.example", "utf8"));
    process.env = { ...vars, BETTER_AUTH_SECRET: "x".repeat(44), ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") } as unknown as NodeJS.ProcessEnv;
    resetEnvCache();
    const e = env();
    expect(e.FACEBOOK_GRAPH_VERSION).toBe(vars.FACEBOOK_GRAPH_VERSION);
    expect(e.INSTAGRAM_GRAPH_VERSION).toBe(vars.INSTAGRAM_GRAPH_VERSION);
  });

  it("uses the Vercel production domain when APP_BASE_URL is unset", () => {
    process.env = { ...saved, APP_BASE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "app.example.com" };
    resetEnvCache();
    expect(env().APP_BASE_URL).toBe("https://app.example.com");
  });
});

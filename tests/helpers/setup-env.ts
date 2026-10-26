(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  APP_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
  STORAGE_LOCAL_DIR: "./.test-storage",
});

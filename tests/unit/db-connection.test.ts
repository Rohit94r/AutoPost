import { describe, expect, it } from "vitest";
import { migrationUrl, pgConnection, withoutClientParams } from "@/server/db/connection";

const NEON_POOLED = "postgresql://neondb_owner:p%40ss@ep-cool-sun-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const NEON_DIRECT = "postgresql://neondb_owner:p%40ss@ep-cool-sun-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("pgConnection", () => {
  it("strips Neon's channel_binding and verifies TLS on the pooled endpoint", () => {
    const c = pgConnection(NEON_POOLED);
    expect(c.url).not.toContain("channel_binding");
    expect(c.url).not.toContain("sslmode");
    expect(c.url).toContain("p%40ss@ep-cool-sun-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb");
    expect(c.pooled).toBe(true);
    expect(c.options.prepare).toBe(false);
    expect(c.options.ssl).toBe("verify-full");
  });

  it("keeps prepared statements on the direct Neon endpoint", () => {
    const c = pgConnection(NEON_DIRECT, { max: 3 });
    expect(c.pooled).toBe(false);
    expect(c.options.prepare).toBe(true);
    expect(c.options.max).toBe(3);
  });

  it("maps sslmode for other hosts and keeps real startup parameters", () => {
    expect(pgConnection("postgres://u:p@db.example.com/app?sslmode=require").options.ssl).toBe("require");
    expect(pgConnection("postgres://u:p@localhost:5433/postgres").options.ssl).toBe(false);
    expect(pgConnection("postgres://u:p@db.example.com/app?sslmode=verify-ca").options.ssl).toBe("verify-full");
    const c = pgConnection("postgres://u:p@db.example.com/app?pgbouncer=true&application_name=flowt");
    expect(c.pooled).toBe(true);
    expect(c.url).toContain("application_name=flowt");
    expect(c.url).not.toContain("pgbouncer");
  });

  it("passes multi-host strings through", () => {
    const raw = "postgres://u:p@h1:5432,h2:5432/app";
    expect(pgConnection(raw).url).toBe(raw);
  });
});

describe("migration URL", () => {
  it("prefers the unpooled URL", () => {
    expect(migrationUrl({ DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT })).toBe(NEON_DIRECT);
    expect(migrationUrl({ DATABASE_URL: NEON_POOLED })).toBe(NEON_POOLED);
  });

  it("keeps sslmode for drizzle-kit", () => {
    const u = withoutClientParams(NEON_DIRECT);
    expect(u).toContain("sslmode=require");
    expect(u).not.toContain("channel_binding");
  });
});

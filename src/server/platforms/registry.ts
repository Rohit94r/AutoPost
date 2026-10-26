import "server-only";
import type { Platform } from "@/lib/platforms";
import { InstagramAdapter } from "./instagram";
import { LinkedInAdapter } from "./linkedin";
import type { PlatformAdapter } from "./types";
import { XAdapter } from "./x";

let adapters: Record<Platform, PlatformAdapter> | undefined;

export function getAdapter(platform: Platform): PlatformAdapter {
  adapters ??= { linkedin: new LinkedInAdapter(), instagram: new InstagramAdapter(), x: new XAdapter() };
  return adapters[platform];
}

export function setAdaptersForTesting(a: Partial<Record<Platform, PlatformAdapter>> | undefined) {
  adapters = a ? ({ ...{ linkedin: new LinkedInAdapter(), instagram: new InstagramAdapter(), x: new XAdapter() }, ...a } as Record<Platform, PlatformAdapter>) : undefined;
}

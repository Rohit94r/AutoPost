import type { Platform } from "@/lib/platforms";

export interface MediaItem {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  originalFilename: string;
  altText: string | null;
  url: string;
  thumbnailUrl: string | null;
}

export interface AccountOption {
  id: string;
  platform: Platform;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  status: string;
  lastError: string | null;
}

export interface VariantState {
  body: string;
  hashtags: string[];
  includeMedia: boolean;
  aiGenerated: boolean;
  locked?: boolean;
}

export interface JobSummary {
  id: string;
  platform: Platform;
  status: string;
  scheduledAt: string;
  timezone: string;
  publishedUrl: string | null;
  lastErrorMessage: string | null;
  lastErrorCode: string | null;
  account: { id: string; displayName: string };
}

export interface BrandOption {
  id: string;
  name: string;
  isDefault: boolean;
}

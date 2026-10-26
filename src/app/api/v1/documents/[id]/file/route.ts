import { NextResponse } from "next/server";
import { getDocumentFile } from "@/server/documents/service";
import { apiRoute, uuidParam } from "@/server/http/handler";

/** Private document preview for workspace members. Served inline, framable same-origin only. */
export const GET = apiRoute<{ id: string }>({}, async ({ params, workspace }) => {
  const f = await getDocumentFile(workspace.id, uuidParam(params.id));
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

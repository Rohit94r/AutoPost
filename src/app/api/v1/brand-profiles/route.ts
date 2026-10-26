import { NextResponse } from "next/server";
import { brandInput, listBrands, saveBrand } from "@/server/brand/service";
import { apiRoute, parseJson } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ workspace }) => ({ profiles: await listBrands(workspace.id) }));

export const POST = apiRoute({}, async ({ req, workspace }) => {
  const profile = await saveBrand(workspace.id, await parseJson(req, brandInput));
  return NextResponse.json({ profile }, { status: 201 });
});

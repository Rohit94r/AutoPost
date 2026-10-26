import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUserAccount } from "@/server/account/service";
import { badRequest } from "@/server/errors";
import { apiRoute, parseJson } from "@/server/http/handler";

/** Permanently delete the signed-in user's account. Requires typing the account email. */
export const DELETE = apiRoute({ role: "viewer" }, async ({ req, user }) => {
  const { confirmEmail } = await parseJson(req, z.object({ confirmEmail: z.string() }));
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) throw badRequest("Type your account email exactly to confirm.");
  await deleteUserAccount(user.id, req);
  const res = NextResponse.json({ ok: true });
  for (const c of req.cookies.getAll()) if (c.name.startsWith("verdant")) res.cookies.delete(c.name);
  return res;
});

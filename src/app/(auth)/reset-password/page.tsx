import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="reset" googleEnabled={integrationStatus().google} />
    </Suspense>
  );
}

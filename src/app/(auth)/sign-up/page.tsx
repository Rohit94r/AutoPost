import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" googleEnabled={integrationStatus().google} />
    </Suspense>
  );
}

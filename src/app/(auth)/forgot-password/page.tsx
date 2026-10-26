import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="forgot" googleEnabled={integrationStatus().google} />
    </Suspense>
  );
}

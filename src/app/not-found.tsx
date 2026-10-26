import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <p className="font-display text-8xl text-white/20">404</p>
        <h1 className="mt-2 font-display text-4xl text-white">This trail ends here</h1>
        <p className="mt-2 text-fog">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

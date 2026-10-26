"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div className="glass-strong max-w-md p-8">
        <h1 className="font-display text-4xl text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-fog">Your work wasn&apos;t lost. Try again; if it keeps happening, share this reference with support.</p>
        {error.digest && <code className="mt-3 block text-xs text-stone">ref: {error.digest}</code>}
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}

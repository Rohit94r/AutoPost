import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Verdant — create once, publish everywhere", template: "%s · Verdant" },
  description:
    "Turn ideas and documents into accurate, natural posts for LinkedIn, Instagram and X. Review, schedule and publish through official APIs.",
};

export const viewport: Viewport = { themeColor: "#07110d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{ classNames: { toast: "bg-[#0c1a14]/90! backdrop-blur-xl! border-white/15! text-mist!" } }}
        />
      </body>
    </html>
  );
}

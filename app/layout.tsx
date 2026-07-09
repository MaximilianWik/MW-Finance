import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "./ui/TopNav";
import { RegisterSW } from "./ui/RegisterSW";
import { AuthProvider } from "./ui/AuthProvider";
import { SigilBackdrop } from "./ui/SigilBackdrop";
import { AsciiSigil } from "./ui/AsciiSigil";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MWFINANCE",
  description: "Personal finance diagnostics terminal.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0e0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-dvh bg-ink text-ink2 antialiased">
        <AuthProvider>
          <SigilBackdrop />
          <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-4 md:px-6">
            <TopNav />
            <div className="mt-4 flex-1">{children}</div>
            <footer className="mt-6 border-t border-edge pt-2 text-[0.65rem] uppercase tracking-term text-faint">
              <div className="flex justify-center overflow-hidden">
                <AsciiSigil
                  name="figure02"
                  tone="edge"
                  opacity={0.8}
                  className="mb-2 text-[0.5rem]"
                />
              </div>
              MWFINANCE · Enable Banking · Neon · Gemini 2.0 Flash — decision support only
            </footer>
          </div>
          <RegisterSW />
        </AuthProvider>
      </body>
    </html>
  );
}

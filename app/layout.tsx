import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "./ui/BottomNav";
import { RegisterSW } from "./ui/RegisterSW";

export const metadata: Metadata = {
  title: "MWFinance",
  description: "Personal finance — accounts, spending, budgets.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MWFinance",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink text-white antialiased">
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-24 pt-6">
          {children}
        </div>
        <BottomNav />
        <RegisterSW />
      </body>
    </html>
  );
}

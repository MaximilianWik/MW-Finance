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

const SITE_URL = process.env.APP_URL ?? "https://mw-finance-six.vercel.app";
const AUTHOR_URL = "https://maximilian-wikstrom.vercel.app/";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: "MWFINANCE",
    template: "%s · MWFINANCE",
  },
  description:
    "Personal finance diagnostics terminal. Tracks Länsförsäkringar transactions, " +
    "manages salary-cycle budgets, savings goals, and surfaces behavioral spending " +
    "insights — built by Maximilian Wikström.",
  applicationName: "MWFINANCE",
  authors: [{ name: "Maximilian Wikström", url: AUTHOR_URL }],
  creator: "Maximilian Wikström",
  keywords: [
    "personal finance",
    "finance terminal",
    "Maximilian Wikström",
    "budget tracker",
    "Swedish finance",
    "Länsförsäkringar",
    "Enable Banking",
    "salary budget",
    "MWFINANCE",
  ],
  manifest: "/manifest.webmanifest",

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "MWFINANCE",
    title: "MWFINANCE — Personal Finance Diagnostics Terminal",
    description:
      "Salary-cycle budgets, AI categorisation, savings goals and behavioral insights. " +
      "Built by Maximilian Wikström.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "MWFINANCE — Personal Finance Diagnostics Terminal by Maximilian Wikström",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "MWFINANCE — Personal Finance Diagnostics Terminal",
    description:
      "Salary-cycle budgets, AI categorisation, savings goals. Built by Maximilian Wikström.",
    images: ["/opengraph-image"],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** JSON-LD: WebApplication authored by a Person with sameAs cross-links. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "MWFINANCE",
      description:
        "Personal finance diagnostics terminal — salary-cycle budgets, AI categorisation, " +
        "savings goals, and behavioral insights.",
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      inLanguage: "en",
      author: { "@id": `${SITE_URL}/#max` },
    },
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#max`,
      name: "Maximilian Wikström",
      url: AUTHOR_URL,
      sameAs: [
        "https://maximilian-wikstrom.vercel.app/",
        "https://github.com/MaximilianWik",
        "https://max-wik.com/",
        "https://tessera-neon.vercel.app/",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <head>
        {/* Identity / rel=me cross-links — assert authorship across all linked properties */}
        <link rel="me" href="https://maximilian-wikstrom.vercel.app/" />
        <link rel="me" href="https://github.com/MaximilianWik" />
        <link rel="me" href="https://max-wik.com/" />
        <link rel="me" href="https://tessera-neon.vercel.app/" />

        {/* Structured data */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static trusted payload
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
                  tone="accent"
                  opacity={0.8}
                  className="mb-2 text-[0.5rem]"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span>
                  MWFINANCE · Enable Banking · Neon · Gemini 2.0 Flash — decision support only
                </span>
                <a
                  href={AUTHOR_URL}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="text-accent hover:underline"
                >
                  Maximilian Wikström
                </a>
              </div>
            </footer>
          </div>
          <RegisterSW />
        </AuthProvider>
      </body>
    </html>
  );
}

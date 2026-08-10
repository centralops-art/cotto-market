import type { Metadata } from "next";
import { Lora, Mulish, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

// Matches the marketing site's type pairing (cotto-web): Mulish for body
// copy, Lora for headings.
const sans = Mulish({ subsets: ["latin"], variable: "--font-sans" });
const heading = Lora({ subsets: ["latin"], variable: "--font-heading" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Cotto Admin",
  description: "Central Ops console for the Cotto Marketplace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", sans.variable, heading.variable, mono.variable)}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

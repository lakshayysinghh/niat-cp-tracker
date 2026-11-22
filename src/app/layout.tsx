import type { Metadata } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "NIAT CP Tracker", template: "%s · NIAT CP Tracker" },
  description: "Internal dashboard for tracking a batch across Codeforces group contests",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "!bg-popover !border-border !text-foreground" }} />
      </body>
    </html>
  );
}

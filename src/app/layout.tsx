import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { SearchBar } from "@/components/SearchBar";

export const metadata: Metadata = {
  title: "StreamBerry",
  description: "A Netflix-style streaming aggregator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <header className="sticky top-0 z-50 flex items-center gap-6 bg-gradient-to-b from-black/90 to-transparent px-4 py-3 md:px-8">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-brand">
            STREAMBERRY
          </Link>
          <nav className="hidden gap-4 text-sm text-neutral-300 md:flex">
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <Link href="/?type=movie" className="hover:text-white">
              Movies
            </Link>
            <Link href="/?type=tv" className="hover:text-white">
              TV Shows
            </Link>
            <Link href="/wrestling" className="hover:text-white">
              Wrestling
            </Link>
          </nav>
          <div className="ml-auto w-full max-w-xs">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </header>
        <main className="pb-16">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Readex_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./dashboard-device-layout.css";
import { AppProviders } from "./providers";

const readexPro = Readex_Pro({
  variable: "--font-readex",
  subsets: ["latin", "arabic"],
  weight: ["200", "300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NARS",
  description: "NARS — إدارة الطلبات",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`light ${readexPro.variable} ${geistMono.variable} h-full min-h-0 antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="flex h-full min-h-0 flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

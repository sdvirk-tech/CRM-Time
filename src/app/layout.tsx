import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const serif = Source_Serif_4({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "CRM-Time",
  description: "Мини-CRM: канал → AI → действие",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${sans.variable} ${serif.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}

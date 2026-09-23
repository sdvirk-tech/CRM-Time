import type { Metadata } from "next";
import "@fontsource/carlito/400.css";
import "@fontsource/carlito/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM-Time",
  description: "Мини-CRM: канал → AI → действие",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

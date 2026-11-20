import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stagerang",
  description: "A collaboration platform connecting brands, creators, and agencies."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Media Collab",
  description: "A collaboration platform for brands, influencers, creators, and agencies."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Media Collab",
  description: "Brand Media Collab connects brands, creators, influencers, agencies, and media professionals to discover opportunities and grow through collaboration."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

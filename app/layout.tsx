import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://www.brandmediacollab.com";
const siteDescription = "Find brand partnerships, creator and influencer campaigns, media opportunities, and trusted creative partners on Brand Media Collab.";
const siteTitle = "Brand Media Collab | Brand, Creator & Influencer Collaborations";
const siteKeywords = [
  "brand collaborations",
  "creator partnerships",
  "influencer campaigns",
  "media opportunities",
  "agency partnerships",
  "production companies",
  "event collaborations"
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: "Brand Media Collab",
  authors: [{ name: "Brand Media Collab" }],
  keywords: siteKeywords,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Brand Media Collab",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/site/images/brand-media-collab-hero.jpg", alt: "Creative professional working at a laptop" }]
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/site/images/brand-media-collab-hero.jpg"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Space_Grotesk } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400']
})

export const metadata: Metadata = {
  title: "OnaraAI",
  description: "Unlock the power of AI with Onara – your personal productivity assistant.",
  openGraph: {
    title: "Onara AI",
    description: "Unlock the power of AI with Onara – your personal productivity assistant.",
    url: "https://onaraai.vercel.app",
    siteName: "Onara AI",
    images: [
      {
        url: "https://onaraai.vercel.app/preview.png",
        width: 1200,
        height: 630,
        alt: "Onara AI preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Onara AI",
    description: "Unlock the power of AI with Onara – your personal productivity assistant.",
    images: ["https://onaraai.vercel.app/preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <Providers>
          {children}
          <Analytics/>
        </Providers>
      </body>
    </html>
  );
}
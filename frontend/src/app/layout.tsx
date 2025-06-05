import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Space_Grotesk } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400']
})

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
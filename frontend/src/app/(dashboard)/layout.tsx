"use client";
import React from "react";
import "../../app/globals.css";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}

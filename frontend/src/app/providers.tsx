"use client";

import { ScrollProvider } from "@/hooks/ScrollContext";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ScrollProvider>
        {children}
        <Toaster
          position="bottom-right"
          expand={true}
          richColors
          duration={5000}
          closeButton
          theme="dark"
          style={{
            marginTop: '6rem'
          }}
          toastOptions={{
            className: 'bg-black text-white border border-gray-800',
            style: {
              background: 'black',
              color: 'white',
              border: '1px solid rgb(31 41 55)'
            }
          }}
        />
      </ScrollProvider>
    </SessionProvider>
  );
}
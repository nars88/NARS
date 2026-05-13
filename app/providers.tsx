"use client";

import { Toaster } from "sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        duration={3000}
        toastOptions={{
          className: "!rounded-2xl !border !border-violet-300/80 !bg-violet-600 !text-white",
        }}
      />
    </>
  );
}

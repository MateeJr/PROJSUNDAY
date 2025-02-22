import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "./error-boundary";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Form Pesanan",
  description: "Form pesanan dengan fitur kamera",
};

// Suppress error reporting
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  // Suppress console errors in development
  const noop = () => {};
  if (process.env.NODE_ENV !== 'production') {
    console.error = noop;
    console.warn = noop;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className={`${inter.className} bg-black`}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tontine - Private Peer-to-Peer Agreement Pools",
  description: "Create private peer-to-peer agreement pools on GenLayer, resolved by decentralized LLM consensus over public web sources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} font-sans h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}


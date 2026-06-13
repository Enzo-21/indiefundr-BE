import type { Metadata } from "next";
import { Inter, Lora, Roboto_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { createSiteMetadata } from "@/lib/marketing/metadata";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = createSiteMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${robotoMono.variable} h-full scroll-smooth antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full w-full flex-auto flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

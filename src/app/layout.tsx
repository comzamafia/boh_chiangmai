import type { Metadata } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";

/* Montserrat — matches chiangmai.ca's Google Font */
const montserrat = Montserrat({
  variable: "--font-sans-base",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/* Playfair Display — elegant serif for headings / brand feel */
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chiang Mai BOH",
  description: "Back-of-House Management System for Chiang Mai",
  icons: { icon: "/logo.svg" },
};

import { ThemeProvider } from "@/components/theme-provider";
import { CurrencyProvider } from "@/components/currency-context";
import { AuthProvider } from "@/components/auth-provider";
import { AppShell } from "@/components/layout/AppShell";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${playfair.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <CurrencyProvider>
              <AppShell>
                {children}
              </AppShell>
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

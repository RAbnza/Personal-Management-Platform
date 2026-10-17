import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { connection } from "next/server";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { NavigationCapabilitiesProvider } from "@/components/shell/navigation-capabilities";
import { sharingEnabled } from "@/modules/sharing/domain/sharing";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Personal Management Platform",
  description:
    "A private personal workspace for managing money, career, and time.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <NavigationCapabilitiesProvider sharing={sharingEnabled()}>
            {children}
          </NavigationCapabilitiesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

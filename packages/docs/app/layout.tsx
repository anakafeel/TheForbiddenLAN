import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider";
import "./global.css";

export const metadata = {
  title: "SkyTalk Documentation",
  description: "Documentation for TheForbiddenLAN Satellite PTT System",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}

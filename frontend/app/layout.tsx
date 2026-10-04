import type { Metadata } from "next";
import "@fontsource/anton/400.css";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import Nav from "@/components/Nav";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Fair Drop: 500 seats, 50,000 fans, no bot advantage",
  description: "A verifiable seat lottery: one verified person, one entry, a publicly sealed list, and a draw anyone can re-run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

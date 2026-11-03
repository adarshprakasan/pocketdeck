import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PocketDeck — Your phone. Your command center.",
  description: "Turn your phone into a customizable browser-based control deck for your computer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

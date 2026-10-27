import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trench Academy",
  description: "Trench Academy: memecoin trench training. Simulator only, no real trades.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

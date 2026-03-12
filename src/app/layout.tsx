import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portwatch - Malaysian Port Disruption Monitor",
  description:
    "Monitor Malaysian port activity and supply chain disruptions using IMF PortWatch data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

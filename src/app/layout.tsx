import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tech-interview-ai",
  description:
    "Practice technical interviews through reasoning and real-world scenarios.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body>
    </html>
  );
}

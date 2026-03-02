import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pomodoro Timer",
  description: "A minimal, distraction-free Pomodoro timer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

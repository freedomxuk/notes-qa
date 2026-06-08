import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notes QA - 智能笔记应用",
  description: "基于笔记的智能问答应用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
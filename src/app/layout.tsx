import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "インターン日程かぶりチェッカー",
  description:
    "複数のインターン候補日程をテキストから一括抽出し、カレンダー上で日程の重複を可視化します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}

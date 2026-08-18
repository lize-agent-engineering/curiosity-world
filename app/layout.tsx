import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { AccessCodeGuard } from '@/components/access-code-guard';

// The UI font is loaded from @fontsource's stylesheet rather than next/font,
// because only the stylesheet carries the per-subset `unicode-range`
// declarations. Pointing next/font at `inter-latin-wght-normal.woff2` loaded
// exactly one subset, so every character outside Latin — Cyrillic for ru-RU,
// tone-marked letters for vi-VN — fell back to an arbitrary OS font and
// rendered in a different typeface mid-word.
//
// Declaring the other subset files as sibling faces of the same family does not
// fix it either: faces with identical descriptors and no `unicode-range` do not
// fall through per glyph, so the browser simply picks one.
//
// `--font-sans` moves to globals.css since the family no longer comes from
// next/font's generated class.
import '@fontsource-variable/inter';
import '@fontsource/zcool-kuaile';
// The width axis, not just weight: the bench sets Latin display type wide, and
// the default `@fontsource-variable/archivo` entry ships the wght axis only.
import '@fontsource-variable/archivo/wdth.css';

export const metadata: Metadata = {
  title: 'Curiosity Studio · 智能体网页应用生成器',
  description:
    '一句话描述需求，规划、编码、审查三个智能体接力生成可运行的单文件网页应用，并支持对话式增量修改与版本回滚。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AccessCodeGuard>{children}</AccessCodeGuard>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

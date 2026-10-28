import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../../../../libs/lightly/dist/style.css';
import '../../../../libs/shared/chibi-theme/src/lib/chibi-theme.css';

export const metadata: Metadata = {
  title: 'Ønskelisten ☁️🎁',
  description:
    'Ønskeliste-app med minimalt dataforbrug, AVIF 512x512 billedkomprimering, Ønskeskyen-import og hemmelig gave-chat.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f0f7ff'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}

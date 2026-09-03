import type { Metadata } from 'next';
import { ENV, IS_PROD } from './env';
import './globals.css';

export const metadata: Metadata = {
  title: 'היום שאחרי',
  description: 'מעקב אחר הכשלים של השבעה באוקטובר ואחר תיקונם — מקורות מתועדים, שלב אחר שלב.',
  robots: IS_PROD ? undefined : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@300;400;600;700&display=swap"
        />
      </head>
      <body>
        {!IS_PROD && <div className="env-ribbon">{ENV}</div>}
        {children}
      </body>
    </html>
  );
}

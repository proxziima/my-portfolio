import type { Metadata } from 'next';
import { Inter, Caveat } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

/** Handwriting for the curious-mode notes only. */
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vinicius Queiroz — engineer and builder',
  description: 'One letter, three disciplines.',
};

/** Runs before first paint: puts the stored theme on <html> so the page never
 *  flashes the wrong palette. Keep it inline and blocking. */
const noFlash = `
(function(){try{
  var t=localStorage.getItem('rl-theme');
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

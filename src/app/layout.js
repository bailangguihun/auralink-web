import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from '../components/ui/theme-provider';
import { HeroUIProvider } from '@heroui/react';
import { ChakraProvider } from '@chakra-ui/react';
import { Toaster } from 'sonner';

const geistSans = localFont({
  src: "../../public/fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../../public/fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata = {
  title: {
    template: '%s | 画音智链',
    default: '画音智链 - 跨模态AI驱动的国粹基因解码与生成平台',
  },
  description: "跨模态AI驱动的音画解码与生成平台，融合现代科技与传统文化",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <HeroUIProvider>
            <ChakraProvider>
              {children}
              <Toaster richColors position="top-right" />
            </ChakraProvider>
          </HeroUIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

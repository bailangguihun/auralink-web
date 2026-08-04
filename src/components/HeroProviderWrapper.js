"use client";

import { HeroUIProvider } from '@heroui/react';
import {ToastProvider} from "@heroui/toast";

export default function HeroProviderWrapper({ children }) {
  return <HeroUIProvider>
    <ToastProvider />
      {children}
  </HeroUIProvider>;
}
 
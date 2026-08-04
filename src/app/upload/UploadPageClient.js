'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import config from '@/config';
import ModeratedImageUploadPanel from '@/components/upload/ModeratedImageUploadPanel';

const API_BASE_URL = config.api.baseUrl;

export default function UploadPage({ initialLanguage = 'ZH' }) {
  return (
    <Suspense fallback={<UploadPageFallback language={initialLanguage} />}>
      <UploadPageContent initialLanguage={initialLanguage} />
    </Suspense>
  );
}

function UploadPageFallback({ language = 'ZH' }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl border border-amber-700/40 bg-zinc-900/80 backdrop-blur p-6 md:p-8">
        <p className="text-zinc-300 text-base md:text-lg">{language === 'EN' ? 'Loading...' : '页面加载中...'}</p>
      </section>
    </main>
  );
}

function UploadPageContent({ initialLanguage = 'ZH' }) {
  const searchParams = useSearchParams();
  const sessionId = useMemo(() => searchParams.get('session') || '', [searchParams]);
  const language = useMemo(() => {
    const raw = searchParams.get('lang') || searchParams.get('language') || initialLanguage;
    return String(raw || '').toUpperCase() === 'EN' ? 'EN' : 'ZH';
  }, [initialLanguage, searchParams]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <ModeratedImageUploadPanel sessionId={sessionId} apiBaseUrl={API_BASE_URL} language={language} />
    </main>
  );
}

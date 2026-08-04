import UploadPageClient from './UploadPageClient';

function pickSessionId(searchParams) {
  const raw = searchParams?.session;
  if (Array.isArray(raw)) return raw[0] || '';
  return raw || '';
}

function pickLanguage(searchParams) {
  const raw = searchParams?.lang || searchParams?.language;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || '').toUpperCase() === 'EN' ? 'EN' : 'ZH';
}

export async function generateMetadata({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const sessionId = pickSessionId(resolvedSearchParams);
  const language = pickLanguage(resolvedSearchParams);

  return {
    title: {
      absolute: sessionId
        ? language === 'EN'
          ? `SumiSound Kiosk Image Upload - ${sessionId}`
          : `水墨之声 SumiSound 展台图片上传 - ${sessionId}`
        : language === 'EN'
          ? 'Kiosk Image Upload'
          : '展台图片上传',
    },
  };
}

export default async function UploadPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  return <UploadPageClient initialLanguage={pickLanguage(resolvedSearchParams)} />;
}

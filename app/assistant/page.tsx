import { AssistantLoading } from '@/components/assistant/assistant-loading';
import type { Metadata } from 'next';
import { ProtectedRoute } from '@/components/protected-route';
import { AssistantScreen } from '@/components/assistant/assistant-screen';
export const metadata: Metadata = { title: '国画助手' };
export default function AssistantPage() { return <ProtectedRoute fallback={<AssistantLoading />}><AssistantScreen /></ProtectedRoute>; }

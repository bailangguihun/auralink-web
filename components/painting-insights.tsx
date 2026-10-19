"use client";

import { useEffect, useRef, useState } from "react";
import { CriticPanel } from "@/components/critic-panel";
import { GuidePanel } from "@/components/guide-panel";
import { useSession } from "@/components/session-provider";
import { initialPaintingInsights, PaintingInsightsController } from "@/lib/painting-insights";

export function PaintingInsights({ paintingId, imageAvailable }: { paintingId: string; imageAvailable: boolean }) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const [state, setState] = useState(initialPaintingInsights);
  const controller = useRef<PaintingInsightsController | null>(null);
  useEffect(() => {
    if (!token) return;
    const instance = new PaintingInsightsController({
      paintingId, token, imageAvailable,
      isCurrent: () => isCurrentSession(sessionIdentity),
      onUnauthorized: () => { signOutIfCurrent(sessionIdentity); }, onChange: setState,
    });
    controller.current = instance;
    void instance.start();
    return () => {
      instance.dispose();
      if (controller.current === instance) controller.current = null;
    };
  }, [paintingId, imageAvailable, token, sessionIdentity, isCurrentSession, signOutIfCurrent]);

  return (
    <>
      <section className="detail-section" aria-label="作品导览">
        <h2>作品导览</h2>
        <GuidePanel {...state.guide} onGenerate={() => { void controller.current?.generateGuide(); }} onRetry={() => { void controller.current?.readGuide(); }} />
      </section>
      <section className="detail-section" aria-label="智能评析">
        <h2>智能评析</h2>
        <CriticPanel state={state.critique} imageAvailable={imageAvailable} onSubmit={() => { void controller.current?.submitCritique(); }} onRead={() => { void controller.current?.readCritique(); }} />
      </section>
    </>
  );
}

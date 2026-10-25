"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/api";
import { useSession } from "@/components/session-provider";

type FavoriteContextValue = {
  isFavorited: (paintingId: string, serverValue: boolean) => boolean;
  isFavoriteBusy: (paintingId: string) => boolean;
  toggleFavorite: (paintingId: string, serverValue: boolean) => Promise<boolean>;
};

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

/**
 * Session-scoped favorite overrides keep Gallery, detail, and /me consistent
 * between server refreshes. They are deliberately discarded for every login
 * generation; an old response is never allowed to affect a newer session.
 */
export function FavoriteProvider({ children }: { children: React.ReactNode }) {
  const { sessionIdentity } = useSession();
  return <FavoriteScope key={sessionIdentity.generation}>{children}</FavoriteScope>;
}

function FavoriteScope({ children }: { children: React.ReactNode }) {
  const { token, status, sessionIdentity, isCurrentSession } = useSession();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const overridesRef = useRef(overrides);
  const busyRef = useRef(busy);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    setOverrides({});
    setBusy(new Set());
  }, [sessionIdentity]);

  const isFavorited = useCallback(
    (paintingId: string, serverValue: boolean) => overrides[paintingId] ?? serverValue,
    [overrides],
  );

  const isFavoriteBusy = useCallback(
    (paintingId: string) => busy.has(paintingId),
    [busy],
  );

  const toggleFavorite = useCallback(async (paintingId: string, serverValue: boolean) => {
    if (status !== "authenticated" || !token) {
      throw new Error("收藏操作需要有效的登录会话。");
    }
    if (busyRef.current.has(paintingId)) {
      return overridesRef.current[paintingId] ?? serverValue;
    }

    const requestToken = token;
    const requestIdentity = sessionIdentity;
    const priorOverride = overridesRef.current[paintingId];
    const previousValue = priorOverride ?? serverValue;
    const nextValue = !previousValue;
    busyRef.current = new Set(busyRef.current).add(paintingId);
    setBusy(busyRef.current);
    overridesRef.current = { ...overridesRef.current, [paintingId]: nextValue };
    setOverrides(overridesRef.current);

    try {
      if (nextValue) await api.favoritePainting(paintingId, requestToken);
      else await api.unfavoritePainting(paintingId, requestToken);
      return nextValue;
    } catch (error) {
      if (isCurrentSession(requestIdentity)) {
        const restored = { ...overridesRef.current };
        if (priorOverride === undefined) delete restored[paintingId];
        else restored[paintingId] = priorOverride;
        overridesRef.current = restored;
        setOverrides(restored);
      }
      throw error;
    } finally {
      if (isCurrentSession(requestIdentity)) {
        const released = new Set(busyRef.current);
        released.delete(paintingId);
        busyRef.current = released;
        setBusy(released);
      }
    }
  }, [isCurrentSession, sessionIdentity, status, token]);

  const value = useMemo(
    () => ({ isFavorited, isFavoriteBusy, toggleFavorite }),
    [isFavorited, isFavoriteBusy, toggleFavorite],
  );

  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export function useFavorites(): FavoriteContextValue {
  const context = useContext(FavoriteContext);
  if (!context) throw new Error("useFavorites 必须在 FavoriteProvider 内使用");
  return context;
}

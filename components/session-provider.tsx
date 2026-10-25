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

import { api, ApiError } from "@/lib/api";
import { SessionIdentityTracker, type SessionIdentity } from "@/lib/session-identity";
import type { AuthResponse, UserProfile } from "@/lib/types";

const TOKEN_KEY = "artlive.session.token.v1";

type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

type SessionContextValue = {
  status: SessionStatus;
  token: string | null;
  user: UserProfile | null;
  profileVerified: boolean;
  establish: (auth: AuthResponse) => void;
  signOut: () => void;
  restore: () => Promise<void>;
  sessionIdentity: SessionIdentity;
  isCurrentSession: (identity: SessionIdentity) => boolean;
  signOutIfCurrent: (identity: SessionIdentity) => boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function profileFromAuth(auth: AuthResponse): UserProfile {
  return {
    id: auth.userId,
    username: auth.username,
    fullName: auth.fullName,
    email: "",
    createdAt: null,
    updatedAt: null,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [profileVerified, setProfileVerified] = useState(false);
  const restoreController = useRef<AbortController | null>(null);
  const identities = useRef(new SessionIdentityTracker());
  const [sessionIdentity, setSessionIdentity] = useState(identities.current.capture());

  const signOut = useCallback(() => {
    restoreController.current?.abort();
    setSessionIdentity(identities.current.replace(null));
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setProfileVerified(false);
    setStatus("anonymous");
  }, []);

  const isCurrentSession = useCallback(
    (identity: SessionIdentity) => identities.current.matches(identity),
    [],
  );

  const signOutIfCurrent = useCallback((identity: SessionIdentity) => {
    if (!identities.current.matches(identity)) return false;
    signOut();
    return true;
  }, [signOut]);

  const restore = useCallback(async () => {
    restoreController.current?.abort();
    const controller = new AbortController(); restoreController.current = controller;
    const storedToken = window.localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      restoreController.current?.abort();
      setSessionIdentity(identities.current.replace(null));
      setToken(null);
      setUser(null);
      setProfileVerified(false);
      setStatus("anonymous");
      return;
    }

    const requestIdentity = identities.current.replace(storedToken);
    setSessionIdentity(requestIdentity);
    setToken(storedToken);
    setStatus("loading");
    setUser(null);
    setProfileVerified(false);
    try {
      const profile = await api.profile(storedToken, controller.signal);
      if (controller.signal.aborted || !identities.current.matches(requestIdentity)) return;
      setUser(profile);
      setProfileVerified(true);
      setStatus("authenticated");
    } catch (error) {
      if (controller.signal.aborted || !identities.current.matches(requestIdentity)) return;
      if (error instanceof ApiError && error.kind === "unauthorized") {
        signOutIfCurrent(requestIdentity);
        return;
      }
      setUser(null);
      setProfileVerified(false);
      setStatus("error");
    }
  }, [signOutIfCurrent]);

  const establish = useCallback((auth: AuthResponse) => {
    restoreController.current?.abort();
    setSessionIdentity(identities.current.replace(auth.token));
    window.localStorage.setItem(TOKEN_KEY, auth.token);
    setToken(auth.token);
    setUser(profileFromAuth(auth));
    setProfileVerified(false);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    void restore();
    return () => restoreController.current?.abort();
  }, [restore]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) void restore();
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [restore]);

  const value = useMemo(
    () => ({ status, token, user, profileVerified, establish, signOut, restore, sessionIdentity, isCurrentSession, signOutIfCurrent }),
    [establish, isCurrentSession, restore, sessionIdentity, signOut, signOutIfCurrent, status, token, user, profileVerified],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession 必须在 SessionProvider 内使用");
  return context;
}

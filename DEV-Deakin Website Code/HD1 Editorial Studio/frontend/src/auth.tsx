import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { PublicUser } from "../../shared/types.ts";
import { request, json, TOKEN_KEY, SESSION_ENDED } from "./api.ts";
interface Session {
  user: PublicUser | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser) => void;
}
const AuthContext = createContext<Session | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function refresh() {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await request<{ user: PublicUser | null }>("/auth/session");
      if (current === generation.current) setUser(data.user);
    } catch (e) {
      if (current === generation.current) {
        setError((e as Error).message);
        setUser(null);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) void refresh();
    };
    const onSessionEnded = () => {
      generation.current += 1;
      setUser(null);
      setLoading(false);
      setError("Your session ended. Log in again to continue.");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_ENDED, onSessionEnded);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_ENDED, onSessionEnded);
    };
  }, []);
  async function login(email: string, password: string) {
    const current = ++generation.current;
    setLoading(false);
    const d = await request<{ token: string; user: PublicUser }>(
      "/auth/login",
      json({ email, password }),
    );
    if (current !== generation.current)
      throw new Error("A newer account action took precedence.");
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
    setLoading(false);
    setError("");
  }
  async function logout() {
    const current = ++generation.current;
    // Capture the current token inside request before clearing local access immediately.
    const pending = request("/auth/logout", json({}));
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setLoading(false);
    setError("");
    try {
      await pending;
    } catch (e) {
      if (current === generation.current)
        setError(`Signed out locally. ${(e as Error).message}`);
    }
  }
  const renderedGeneration = generation.current;
  const updateUser = (next: PublicUser) => {
    // A response from an unmounted upgrade screen must not restore its previous account.
    if (renderedGeneration !== generation.current) return;
    setUser((current) => (current?.id === next.id ? next : current));
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        refresh,
        setUser: updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw Error("AuthProvider is missing.");
  return v;
}

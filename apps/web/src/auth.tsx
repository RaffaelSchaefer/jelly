import * as Dialog from "@radix-ui/react-dialog";
import { LogIn, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { currentUser, displayError, pb } from "./api";
import type { UserRecord } from "./types";

interface AuthValue {
  user: UserRecord | null;
  login: () => Promise<void>;
  logout: () => void;
  openLogin: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(currentUser);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => pb.authStore.onChange(() => setUser(currentUser()), true), []);
  // Holt neue Profilfelder (z. B. discordAvatar) fuer bestehende Sessions nach.
  useEffect(() => {
    if (pb.authStore.isValid)
      void pb
        .collection("users")
        .authRefresh()
        .catch(() => {});
  }, []);

  async function login() {
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").authWithOAuth2({ provider: "discord", createData: {} });
      setOpen(false);
    } catch (loginError) {
      setError(displayError(loginError));
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo<AuthValue>(
    () => ({
      user,
      login,
      logout: () => pb.authStore.clear(),
      openLogin: () => setOpen(true),
    }),
    [user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-card p-7 shadow-2xl">
            <Dialog.Close
              className="absolute right-4 top-4 rounded-lg p-2 text-muted hover:bg-card-hover hover:text-copy"
              aria-label="Dialog schließen"
            >
              <X size={19} />
            </Dialog.Close>
            <div className="grid size-12 place-items-center bg-primary text-white">
              <LogIn size={23} />
            </div>
            <Dialog.Title className="mt-5 text-2xl font-black text-copy">
              Bereit für die nächste Runde?
            </Dialog.Title>
            <Dialog.Description className="mt-2 leading-6 text-muted">
              Melde dich mit Discord an, um Events und Lobbys zu erstellen oder teilzunehmen.
            </Dialog.Description>
            {error && (
              <p className="mt-4 border-l-4 border-danger bg-danger/10 p-3 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              onClick={() => void login()}
              disabled={busy}
              className="btn-wipe mt-6 w-full border-2 border-primary px-4 py-3 font-bold uppercase tracking-wide text-white hover:text-primary disabled:opacity-60"
            >
              {busy ? "Discord wird geöffnet …" : "Mit Discord anmelden"}
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  return value;
}

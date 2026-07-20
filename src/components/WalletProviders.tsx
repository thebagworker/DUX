import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import Logo from "./Logo";

/**
 * Wallet connectivity for DUX, built directly on the Solana Wallet Standard.
 *
 * Rather than hard-coding one or two injected providers, we listen to the
 * Wallet Standard discovery handshake, which every modern Solana wallet — including
 * Phantom, Solflare, Backpack and the Jupiter wallet extension — registers with.
 * That means any wallet the user has installed shows up automatically, and we
 * never have to special-case a particular provider.
 *
 * We only ever call `connect` and `signMessage`: DUX reads balances and verifies
 * ownership via a signed message; it never builds, signs or sends transactions.
 */

/** A single account exposed by a Wallet Standard wallet. */
interface StandardAccount {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
  label?: string;
  icon?: string;
}

/** The subset of the Wallet Standard wallet interface DUX relies on. */
interface StandardWallet {
  version: string;
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly StandardAccount[];
  features: Record<string, unknown>;
}

type ConnectFeature = { connect(): Promise<{ accounts: readonly StandardAccount[] }> };
type DisconnectFeature = { disconnect(): Promise<void> };
type SignMessageFeature = {
  signMessage(input: {
    account: StandardAccount;
    message: Uint8Array;
  }): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
};
type EventsFeature = {
  on(event: "change", listener: (props: { accounts?: readonly StandardAccount[] }) => void): () => void;
};

/** Wallets a user can install when none are detected yet. */
const INSTALL_OPTIONS: { name: string; url: string }[] = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  {
    name: "Jupiter",
    url: "https://chromewebstore.google.com/detail/iledlaeogohbilgbfhmbgkgmpplbfboh",
  },
  { name: "Backpack", url: "https://backpack.app/download" },
];

/* --- Wallet Standard discovery registry (module singleton) ---------------- */

type RegisterCallback = (...wallets: StandardWallet[]) => () => void;

interface WalletRegistry {
  getWallets(): StandardWallet[];
  subscribe(listener: () => void): () => void;
}

function createWalletRegistry(): WalletRegistry {
  const wallets = new Set<StandardWallet>();
  const listeners = new Set<() => void>();

  const register: RegisterCallback = (...incoming) => {
    let added = false;
    for (const wallet of incoming) {
      if (!wallets.has(wallet)) {
        wallets.add(wallet);
        added = true;
      }
    }
    if (added) listeners.forEach((listener) => listener());
    return () => {};
  };

  const api = { register };
  window.addEventListener("wallet-standard:register-wallet", (event: Event) => {
    (event as CustomEvent<(api: { register: RegisterCallback }) => void>).detail?.(api);
  });
  // Prompt wallets that initialized before us to register right now.
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));

  return {
    getWallets: () => [...wallets],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let sharedRegistry: WalletRegistry | null = null;
function getWalletRegistry(): WalletRegistry | null {
  if (typeof window === "undefined") return null;
  if (!sharedRegistry) sharedRegistry = createWalletRegistry();
  return sharedRegistry;
}

/** Keep only wallets that can connect + sign messages on Solana. */
function isUsableSolanaWallet(wallet: StandardWallet): boolean {
  return "standard:connect" in wallet.features && "solana:signMessage" in wallet.features;
}

function dedupeByName(wallets: StandardWallet[]): StandardWallet[] {
  const seen = new Set<string>();
  const result: StandardWallet[] = [];
  for (const wallet of wallets) {
    if (seen.has(wallet.name)) continue;
    seen.add(wallet.name);
    result.push(wallet);
  }
  return result;
}

/* --- Context -------------------------------------------------------------- */

interface WalletState {
  address: string | null;
  selectedWallet: string | null;
  selectedWalletIcon: string | null;
  connected: boolean;
  connecting: boolean;
  openPicker: () => void;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

const WalletCtx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProviders");
  return ctx;
}

export default function WalletProviders({ children }: { children: ReactNode }) {
  const [availableWallets, setAvailableWallets] = useState<StandardWallet[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<StandardWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const connectedWalletRef = useRef<StandardWallet | null>(null);
  const cleanupListeners = useRef<(() => void) | null>(null);

  // Discover installed wallets and stay in sync as more register.
  useEffect(() => {
    const registry = getWalletRegistry();
    if (!registry) return;
    const update = () =>
      setAvailableWallets(dedupeByName(registry.getWallets().filter(isUsableSolanaWallet)));
    update();
    return registry.subscribe(update);
  }, []);

  useEffect(() => () => cleanupListeners.current?.(), []);

  const resetConnection = useCallback(() => {
    cleanupListeners.current?.();
    cleanupListeners.current = null;
    connectedWalletRef.current = null;
    setAddress(null);
    setSelectedWallet(null);
  }, []);

  const connectTo = useCallback(
    async (wallet: StandardWallet) => {
      setConnecting(true);
      try {
        const connectFeature = wallet.features["standard:connect"] as ConnectFeature;
        const result = await connectFeature.connect();
        const account = result.accounts[0] ?? wallet.accounts[0];
        if (!account) return;

        cleanupListeners.current?.();
        connectedWalletRef.current = wallet;
        setAddress(account.address);
        setSelectedWallet(wallet);
        setPickerOpen(false);

        const eventsFeature = wallet.features["standard:events"] as EventsFeature | undefined;
        const off = eventsFeature?.on("change", (props) => {
          if (!props.accounts) return;
          const next = props.accounts[0]?.address ?? null;
          if (next) setAddress(next);
          else resetConnection();
        });
        cleanupListeners.current = () => off?.();
      } catch {
        /* user rejected the connect prompt */
      } finally {
        setConnecting(false);
      }
    },
    [resetConnection]
  );

  const disconnect = useCallback(async () => {
    const wallet = connectedWalletRef.current;
    resetConnection();
    try {
      const disconnectFeature = wallet?.features["standard:disconnect"] as
        | DisconnectFeature
        | undefined;
      await disconnectFeature?.disconnect();
    } catch {
      /* ignore */
    }
  }, [resetConnection]);

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    const wallet = connectedWalletRef.current;
    if (!wallet) throw new Error("Wallet not connected");
    const account = wallet.accounts[0];
    if (!account) throw new Error("Wallet has no connected account");
    const signFeature = wallet.features["solana:signMessage"] as SignMessageFeature;
    const outputs = await signFeature.signMessage({ account, message });
    const signature = outputs[0]?.signature;
    if (!signature) throw new Error("Wallet returned no signature");
    return new Uint8Array(signature);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      selectedWallet: selectedWallet?.name ?? null,
      selectedWalletIcon: selectedWallet?.icon ?? null,
      connected: address !== null,
      connecting,
      openPicker: () => setPickerOpen(true),
      disconnect,
      signMessage,
    }),
    [address, selectedWallet, connecting, disconnect, signMessage]
  );

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {pickerOpen && (
        <WalletPicker
          wallets={availableWallets}
          connecting={connecting}
          onSelect={connectTo}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </WalletCtx.Provider>
  );
}

/* --- Connect modal (DUX-branded) ------------------------------------------ */

function WalletPicker({
  wallets,
  connecting,
  onSelect,
  onClose,
}: {
  wallets: StandardWallet[];
  connecting: boolean;
  onSelect: (wallet: StandardWallet) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        className="w-full max-w-sm animate-fade-in overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-black/25"
        onClick={(event) => event.stopPropagation()}
      >
        {/* DUX-branded header */}
        <div className="relative flex items-center gap-3 border-b border-line bg-gradient-to-br from-brand-soft/70 to-transparent p-5">
          <Logo showWordmark={false} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
              Connect to Torch
            </p>
            <h3 className="text-lg font-bold leading-tight text-ink">Choose a wallet</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-ink-dim transition hover:bg-bg-soft hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {wallets.length > 0 ? (
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => onSelect(wallet)}
                  disabled={connecting}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg-soft px-4 py-3 text-left transition hover:border-accent disabled:opacity-50"
                >
                  {wallet.icon ? (
                    <img src={wallet.icon} alt="" className="h-8 w-8 rounded-lg" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-card font-mono text-xs font-bold text-ink-dim ring-1 ring-line">
                      {wallet.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="flex-1 text-sm font-semibold text-ink">{wallet.name}</span>
                  <span className="text-xs font-medium text-ink-dim">
                    {connecting ? "Connecting…" : "Detected"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-bg-soft p-4 text-center">
              <p className="text-sm font-semibold text-ink">No Solana wallet detected</p>
              <p className="mt-1 text-xs text-ink-dim">Install one of these, then reopen this dialog.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {INSTALL_OPTIONS.map((option) => (
                  <a
                    key={option.name}
                    href={option.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent"
                  >
                    {option.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 flex items-start gap-1.5 text-[11px] text-ink-dim">
            <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            Torch only reads balances and asks you to sign a message — never a transaction. Switch
            accounts inside your wallet extension.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- Header connect button ------------------------------------------------ */

/** Connect button that becomes a profile dropdown once a wallet is linked. */
export function WalletButton() {
  const {
    address,
    connected,
    connecting,
    selectedWallet,
    selectedWalletIcon,
    openPicker,
    disconnect,
  } = useWallet();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on an outside click or Escape press.
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Reset the "Copied" affordance shortly after it shows.
  useEffect(() => {
    if (!justCopied) return;
    const timer = window.setTimeout(() => setJustCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [justCopied]);

  if (!connected) {
    return (
      <button
        onClick={openPicker}
        disabled={connecting}
        className="rounded-xl bg-brand-strong px-3.5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:px-5"
      >
        {connecting ? (
          "Connecting…"
        ) : (
          <>
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect Wallet</span>
          </>
        )}
      </button>
    );
  }

  const short = address ? `${address.slice(0, 4)}..${address.slice(-4)}` : "";

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard
      ?.writeText(address)
      .then(() => setJustCopied(true))
      .catch(() => {});
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex items-center gap-2 rounded-xl bg-brand-strong px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
      >
        {selectedWalletIcon && (
          <img src={selectedWalletIcon} alt="" className="h-4 w-4 rounded" />
        )}
        <span className="font-mono">{short}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 animate-fade-in overflow-hidden rounded-2xl border border-line bg-card shadow-xl shadow-black/20"
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 border-b border-line bg-gradient-to-br from-brand-soft/60 to-transparent p-4">
            {selectedWalletIcon ? (
              <img src={selectedWalletIcon} alt="" className="h-10 w-10 rounded-xl" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg-soft font-mono text-sm font-bold text-ink-dim ring-1 ring-line">
                {short.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              {selectedWallet && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  {selectedWallet}
                </p>
              )}
              <p className="truncate font-mono text-sm font-bold text-ink">{short}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={copyAddress}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-bg-soft"
            >
              {justCopied ? (
                <CheckIcon className="h-4 w-4 text-up" />
              ) : (
                <CopyIcon className="h-4 w-4 text-ink-dim" />
              )}
              {justCopied ? "Copied!" : "Copy address"}
            </button>

            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate("/portfolio");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-bg-soft"
            >
              <WalletIcon className="h-4 w-4 text-ink-dim" />
              My portfolio
            </button>

            <a
              role="menuitem"
              href={`https://solscan.io/account/${address ?? ""}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-bg-soft"
            >
              <ExternalLinkIcon className="h-4 w-4 text-ink-dim" />
              View on Solscan
            </a>

            <div className="my-1 border-t border-line" />

            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
            >
              <LogoutIcon className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

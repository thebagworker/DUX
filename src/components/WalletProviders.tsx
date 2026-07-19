import { useEffect, useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { BROWSER_RPC } from "../lib/config";

/**
 * Keeps wallet selection honest:
 * - on page load, clear any stale persisted selection (no silent reconnects)
 * - on disconnect, clear the selection again
 * The connect button therefore always opens the wallet picker modal.
 */
function WalletSelectionReset() {
  const { wallet, connected, select } = useWallet();

  // on mount: drop stale selection left over from a previous visit
  useEffect(() => {
    try {
      localStorage.removeItem("walletName");
    } catch {
      /* ignore */
    }
    try {
      select(null);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // on disconnect: drop the selection so the picker shows next time
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) return;
    const onDisconnect = () => {
      try {
        select(null);
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem("walletName");
      } catch {
        /* ignore */
      }
    };
    adapter.on("disconnect", onDisconnect);
    return () => {
      adapter.off("disconnect", onDisconnect);
    };
  }, [wallet, connected, select]);

  return null;
}

export default function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={BROWSER_RPC}>
      {/* no autoConnect: the site never reconnects silently on page load */}
      <WalletProvider
        wallets={wallets}
        onError={(e) => {
          console.warn("wallet error:", e?.message ?? e);
        }}
      >
        <WalletModalProvider>
          <WalletSelectionReset />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

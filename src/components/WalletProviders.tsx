import { useEffect, useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { BROWSER_RPC } from "../lib/config";

/**
 * After a disconnect, clear the persisted wallet selection so the next click
 * on the connect button always opens the wallet picker modal again instead of
 * silently reconnecting the previously selected wallet.
 */
function WalletSelectionReset() {
  const { wallet, select } = useWallet();

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
  }, [wallet, select]);

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
          // never let a wallet error crash the app
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

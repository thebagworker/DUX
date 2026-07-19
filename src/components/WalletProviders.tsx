import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { BROWSER_RPC } from "../lib/config";

function WalletSelectionReset({ children }: { children: ReactNode }) {
  const { connected, disconnecting, select } = useWallet();
  const wasConnected = useRef(connected);

  useEffect(() => {
    if (wasConnected.current && !connected && !disconnecting) {
      // After a disconnect finishes, clear the persisted wallet selection so the
      // next click on the wallet button opens the picker modal instead of silently
      // reconnecting to the previously selected wallet.
      select(null);
    }
    wasConnected.current = connected;
  }, [connected, disconnecting, select]);

  return children;
}

export default function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={BROWSER_RPC}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <WalletSelectionReset>{children}</WalletSelectionReset>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

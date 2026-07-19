import { Routes, Route, Link } from "react-router-dom";
import WalletProviders from "./components/WalletProviders";
import Landing from "./pages/Landing";
import TokenPage from "./pages/TokenPage";
import Feed from "./pages/Feed";
import Docs from "./pages/Docs";

export default function App() {
  return (
    <WalletProviders>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5">
        {/* non-affiliation notice, keep visible on every page */}
        <div className="-mx-5 border-b border-line bg-bg-soft px-5 py-1.5 text-left text-[11px] text-ink-dim">
          This is <strong>not</strong> Dexscreener. Independent open-source project, not
          affiliated with, endorsed by, or connected to DEX Screener, Inc. in any way.
        </div>
        <header className="mb-8 flex items-center justify-between border-b border-line py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <img src="/logo.png" alt="DUX logo" className="h-8 w-8" />
            DUX
          </Link>
          <nav className="flex gap-5 text-sm text-ink-dim">
            <Link to="/feed" className="hover:text-ink">
              Live Feed
            </Link>
            <Link to="/docs" className="hover:text-ink">
              API Docs
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
              title="Open source, replace with your repo URL"
            >
              GitHub
            </a>
          </nav>
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/token/:address" element={<TokenPage />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/docs" element={<Docs />} />
          </Routes>
        </main>
        <footer className="mt-12 border-t border-line py-6 text-center text-[13px] text-ink-dim">
          <p>Free &amp; open source. No fees, ever. Verification is fully on-chain.</p>
          <p className="mt-1.5 text-[11px]">
            DUX is an independent community project and is not affiliated with, endorsed
            by, or connected to DEX Screener, Inc. ("Dexscreener"). All trademarks are the
            property of their respective owners. This site provides token metadata submitted by
            verified token authorities/holders; nothing here is financial advice.
          </p>
        </footer>
      </div>
    </WalletProviders>
  );
}

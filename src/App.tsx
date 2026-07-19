import { useEffect, useState } from "react";
import { Routes, Route, Link, Outlet, useLocation } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { WatchlistProvider, useWatchlist } from "./lib/watchlist";
import ThemeToggle from "./components/ThemeToggle";
import ToastHost from "./components/ToastHost";
import WalletProviders, { WalletButton } from "./components/WalletProviders";
import GlobalSearch from "./components/GlobalSearch";
import Landing from "./pages/Landing";
import TokenPage from "./pages/TokenPage";
import Feed from "./pages/Feed";
import Docs from "./pages/Docs";
import Watchlist from "./pages/Watchlist";
import Portfolio from "./pages/Portfolio";
import EmbedChart from "./pages/EmbedChart";

/** The navigation destinations shared by the desktop bar and the mobile drawer. */
const NAV_LINKS = [
  { to: "/feed", label: "Live Feed" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/docs", label: "API Docs" },
] as const;

const GITHUB_URL = "https://github.com/Fearonchain/DUX";

/** Small pill showing how many tokens are on the watchlist. */
function WatchlistBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-soft px-1.5 text-[11px] font-bold text-brand">
      {count}
    </span>
  );
}

/** Header link to the watchlist, badged with the number of watched tokens. */
function WatchlistNavLink() {
  const { watchedCount } = useWatchlist();
  return (
    <Link to="/watchlist" className="hidden items-center gap-1.5 hover:text-ink sm:inline-flex">
      Watchlist
      <WatchlistBadge count={watchedCount} />
    </Link>
  );
}

/**
 * Hamburger menu shown only on small screens. It slides a drawer in from the
 * right containing every navigation destination (the desktop-only header links
 * plus the watchlist), so phone users can reach the whole site.
 */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const { watchedCount } = useWatchlist();
  const location = useLocation();

  // Close the drawer whenever the route changes (e.g. after tapping a link).
  useEffect(() => setOpen(false), [location.pathname]);

  // Lock background scroll while the drawer owns the screen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const linkClass =
    "flex items-center justify-between rounded-lg px-3 py-2.5 text-base font-semibold text-ink transition hover:bg-bg-soft";

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-dim transition hover:border-accent hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[85%] animate-fade-in flex-col border-l border-line bg-card shadow-2xl shadow-black/25">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
                <img src="/logo.png" alt="" className="h-7 w-7 dark:hidden" />
                <img src="/logo-dark.png" alt="" className="hidden h-7 w-7 dark:block" />
                DUX
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-dim transition hover:bg-bg-soft hover:text-ink"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {NAV_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              ))}
              <Link to="/watchlist" className={linkClass}>
                <span className="flex items-center gap-2">
                  Watchlist
                  <WatchlistBadge count={watchedCount} />
                </span>
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={linkClass}>
                GitHub
              </a>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full DUX site chrome (notice + header + footer) shared by every normal page. */
function SiteChrome() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* non-affiliation notice, keep visible on every page */}
      <div className="border-b border-line bg-bg-soft px-5 py-1.5 text-left text-[11px] text-ink-dim">
        This is <strong>not</strong> Dexscreener. Independent open-source project, not affiliated
        with, endorsed by, or connected to DEX Screener, Inc. in any way.
      </div>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-4 sm:gap-4 sm:px-5">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight"
          >
            <img src="/logo.png" alt="DUX logo" className="h-8 w-8 dark:hidden" />
            <img src="/logo-dark.png" alt="DUX logo" className="hidden h-8 w-8 dark:block" />
            DUX
          </Link>
          <div className="flex flex-1 justify-center">
            <GlobalSearch />
          </div>
          <nav className="flex shrink-0 items-center gap-3 text-sm text-ink-dim sm:gap-5">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hidden hover:text-ink sm:inline">
                {link.label}
              </Link>
            ))}
            <WatchlistNavLink />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden hover:text-ink sm:inline"
            >
              GitHub
            </a>
            <ThemeToggle />
            <WalletButton />
            <MobileNav />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pt-8">
        <Outlet />
      </main>
      <footer className="mt-12 border-t border-line">
        <div className="mx-auto w-full max-w-7xl px-5 py-6 text-center text-[13px] text-ink-dim">
          <p>Free &amp; open source. No fees, ever. Verification is fully on-chain.</p>
          <p className="mt-1.5 text-[11px]">
            DUX is an independent community project and is not affiliated with, endorsed by, or
            connected to DEX Screener, Inc. ("Dexscreener"). All trademarks are the property of
            their respective owners. This site provides token metadata submitted by verified token
            authorities/holders; nothing here is financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WatchlistProvider>
        <WalletProviders>
          <Routes>
            {/* Chrome-free chart for third-party <iframe> embeds. */}
            <Route path="/embed/token/:address" element={<EmbedChart />} />

            {/* Everything else renders inside the full DUX site chrome. */}
            <Route element={<SiteChrome />}>
              <Route path="/" element={<Landing />} />
              <Route path="/token/:address" element={<TokenPage />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/docs" element={<Docs />} />
            </Route>
          </Routes>
          <ToastHost />
        </WalletProviders>
      </WatchlistProvider>
    </ThemeProvider>
  );
}

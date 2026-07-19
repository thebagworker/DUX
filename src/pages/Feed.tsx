import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../lib/config";
import { relTime, shortenAddress, type TokenProfile } from "../lib/types";
import {
  fetchMarketPair,
  formatPercent,
  formatPriceUsd,
  sparkPointsFromPair,
  type MarketPair,
} from "../lib/market";
import Sparkline from "../components/token/Sparkline";

const POLL_MS = 5000;

export default function Feed() {
  const [profiles, setProfiles] = useState<TokenProfile[]>([]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, forceTick] = useState(0);
  const [markets, setMarkets] = useState<Record<string, MarketPair | null>>({});
  const known = useRef<Map<string, string>>(new Map());
  const first = useRef(true);
  const fetchedMarkets = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stop = false;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/token-profiles/recent-updates/v1`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data: TokenProfile[] = await res.json();

        const changed = new Set<string>();
        if (!first.current) {
          for (const p of data) {
            if (known.current.get(p.tokenAddress) !== p.updatedAt) changed.add(p.tokenAddress);
          }
        }
        first.current = false;
        known.current = new Map(data.map((p) => [p.tokenAddress, p.updatedAt]));

        setProfiles(data);
        setLastFetch(new Date());
        if (changed.size > 0) {
          setFresh(changed);
          setTimeout(() => setFresh(new Set()), 4000);
        }
      } catch {
        /* transient error, next poll retries */
      }
    }

    poll();
    const iv = setInterval(poll, POLL_MS);
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      stop = true;
      clearInterval(iv);
      clearInterval(tick);
    };
  }, []);

  // Lazily pull live market data for each token that shows up in the feed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const p of profiles) {
        if (fetchedMarkets.current.has(p.tokenAddress)) continue;
        fetchedMarkets.current.add(p.tokenAddress);
        const pair = await fetchMarketPair(p.tokenAddress);
        if (cancelled) return;
        setMarkets((m) => ({ ...m, [p.tokenAddress]: pair }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold">Live Feed</h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-soft px-3 py-1 text-xs font-bold text-accent">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent" /> LIVE
          {lastFetch && (
            <span className="font-normal text-ink-dim">
              · updated {relTime(lastFetch.toISOString())}
            </span>
          )}
        </span>
      </div>
      <p className="mt-2 text-ink-dim">
        Token profiles that were just updated, newest first. Refreshes automatically every
        5&nbsp;seconds.
      </p>

      {profiles.length === 0 && (
        <div className="mt-5 rounded-xl border border-line bg-card p-5 text-center text-ink-dim">
          No updates yet. As soon as someone updates their token info, it shows up here.
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => (
          <Link
            key={p.tokenAddress}
            to={`/token/${p.tokenAddress}`}
            className={`overflow-hidden rounded-xl border border-line bg-card transition hover:-translate-y-0.5 hover:border-accent ${
              fresh.has(p.tokenAddress) ? "animate-flash" : ""
            }`}
          >
            <div className="aspect-[3/1] bg-bg-soft">
              {p.header && (
                <img src={p.header} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-3.5">
              <div className="flex items-center gap-2">
                {p.icon && (
                  <img src={p.icon} alt="" loading="lazy" className="h-7 w-7 rounded-full bg-bg-soft object-cover" />
                )}
                <span className="font-mono text-sm font-semibold">{shortenAddress(p.tokenAddress)}</span>
                {fresh.has(p.tokenAddress) && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    UPDATED
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-dim">{relTime(p.updatedAt)}</span>
              </div>
              {(() => {
                const pair = markets[p.tokenAddress];
                if (!pair) return null;
                const up = pair.priceChange.h24 >= 0;
                return (
                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-bg-soft px-2.5 py-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-ink">
                        {formatPriceUsd(pair.priceUsd)}
                      </p>
                      <span className={`text-[11px] font-semibold ${up ? "text-up" : "text-down"}`}>
                        {formatPercent(pair.priceChange.h24)} · 24h
                      </span>
                    </div>
                    <Sparkline points={sparkPointsFromPair(pair)} up={up} />
                  </div>
                );
              })()}
              {p.description && (
                <p className="mt-2 line-clamp-2 text-[13px] text-ink-dim">{p.description}</p>
              )}
              {p.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.links.map((l, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-line bg-bg-soft px-2.5 py-0.5 text-xs text-ink-dim"
                    >
                      {l.label || l.type || "link"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

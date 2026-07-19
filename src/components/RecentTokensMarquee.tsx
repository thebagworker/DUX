import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../lib/config";
import { relTime, shortenAddress, type TokenProfile } from "../lib/types";

/** Auto-scrolling strip of the most recently added token profiles. */
export default function RecentTokensMarquee() {
  const [tokens, setTokens] = useState<TokenProfile[]>([]);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/token-profiles/latest/v1`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data: TokenProfile[] = await res.json();
        if (!stop) setTokens(Array.isArray(data) ? data.slice(0, 20) : []);
      } catch {
        /* transient error, ignore */
      }
    }
    load();
    const iv = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  if (tokens.length === 0) return null;

  // Duplicate the list so the -50% keyframe loops seamlessly.
  const loop = [...tokens, ...tokens];
  const duration = Math.max(24, tokens.length * 3.5);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-card">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-gradient-to-r from-card via-card/95 to-transparent pl-3 pr-8">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand">
          Just added
        </span>
      </div>

      <div
        className="flex w-max animate-marquee items-center gap-2.5 py-2.5 pl-36 group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {loop.map((t, i) => (
          <Link
            key={`${t.tokenAddress}-${i}`}
            to={`/token/${t.tokenAddress}`}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-bg-soft px-3 py-1.5 transition hover:border-brand hover:bg-brand-soft"
          >
            {t.icon ? (
              <img src={t.icon} alt="" loading="lazy" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <span className="h-5 w-5 rounded-full bg-line" />
            )}
            <span className="font-mono text-xs font-semibold text-ink">
              {shortenAddress(t.tokenAddress)}
            </span>
            <span className="text-[10px] text-ink-dim">{relTime(t.updatedAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

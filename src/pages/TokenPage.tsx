import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { API_BASE } from "../lib/config";
import { LINK_TYPES, shortenAddress, type TokenLink, type TokenProfile } from "../lib/types";

export default function TokenPage() {
  const { address = "" } = useParams();
  const { publicKey, signMessage, connected } = useWallet();

  const [profile, setProfile] = useState<TokenProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<TokenLink[]>([]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const bannerPreview = useMemo(
    () => (bannerFile ? URL.createObjectURL(bannerFile) : (profile?.header ?? null)),
    [bannerFile, profile]
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/token-profiles/solana/${address}`, { cache: "no-store" });
      if (res.ok) {
        const p: TokenProfile = await res.json();
        setProfile(p);
        setDescription(p.description ?? "");
        setLinks(p.links ?? []);
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function verify() {
    if (!publicKey || !signMessage) return;
    setVerifying(true);
    setMsg(null);
    try {
      const wallet = publicKey.toBase58();
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, tokenAddress: address }),
      });
      if (!nonceRes.ok) throw new Error((await nonceRes.json()).error ?? "nonce request failed");
      const { nonce, message } = await nonceRes.json();

      const sig = await signMessage(new TextEncoder().encode(message));

      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, tokenAddress: address, nonce, signature: bs58.encode(sig) }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.detail ?? data.error ?? "verification failed");
      setEditToken(data.editToken);
      setRole(data.role);
      setMsg({ kind: "ok", text: `Verified (${data.role}). ${data.detail}` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setVerifying(false);
    }
  }

  async function save() {
    if (!editToken) return;
    setSaving(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set(
        "payload",
        JSON.stringify({
          description: description.trim() || null,
          links: links.filter((l) => l.url.trim().length > 0),
        })
      );
      if (bannerFile) form.set("banner", bannerFile);

      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${editToken}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "save failed");
      setMsg({ kind: "ok", text: "Saved. Live instantly via the API." });
      setBannerFile(null);
      if (bannerInput.current) bannerInput.current.value = "";
      await loadProfile();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  function setLink(i: number, patch: Partial<TokenLink>) {
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const inputCls =
    "rounded-lg border border-line bg-bg-soft px-3 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-semibold">{shortenAddress(address)}</h2>
          <span className="rounded-md border border-accent px-2 py-0.5 text-xs text-accent">
            Solana
          </span>
        </div>
        <WalletMultiButton />
      </div>

      {/* live preview */}
      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="relative aspect-[3/1] bg-bg-soft">
          {bannerPreview ? (
            <img src={bannerPreview} alt="banner" className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-dim">
              No banner
            </div>
          )}
        </div>
        <div className="flex items-start gap-4 px-5 pb-5 pt-4">
          {profile?.icon && (
            <div className="relative z-10 -mt-12">
              <img
                src={profile.icon}
                alt="token icon"
                title="Icon comes from the token's on-chain metadata and cannot be edited"
                className="h-16 w-16 rounded-full border-[3px] border-card bg-bg-soft object-cover"
              />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm">
              {description || <span className="text-ink-dim">No description</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {links
                .filter((l) => l.url)
                .map((l, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-line bg-bg-soft px-2.5 py-0.5 text-xs text-ink-dim"
                  >
                    {l.label || l.type || "link"}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </section>

      {loading && <p className="text-ink-dim">Loading profile…</p>}

      {!editToken && (
        <section className="rounded-xl border border-line bg-card p-5">
          <h3 className="mb-2 font-semibold">Unlock editing</h3>
          <p className="mb-4 text-sm text-ink-dim">
            Connect the wallet that is either the token authority (dev wallet / pump.fun creator)
            or holds at least 3% of the supply. You only sign a message: no transaction, no
            cost, no access to your funds.
          </p>
          <button
            onClick={verify}
            disabled={!connected || !signMessage || verifying}
            className="rounded-xl bg-accent px-6 py-3 font-bold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying
              ? "Checking on-chain…"
              : connected
                ? "Verify with wallet"
                : "Connect wallet first"}
          </button>
        </section>
      )}

      {editToken && (
        <section className="rounded-xl border border-line bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Edit token info</h3>
            <span className="rounded-md bg-accent px-2.5 py-0.5 text-xs font-bold text-white">
              {role}
            </span>
          </div>

          <label className="mb-4 flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-dim">
              Banner (3:1, cropped to 1500×500, max 5 MB)
            </span>
            <input
              ref={bannerInput}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
          </label>

          <label className="mb-4 flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-dim">Description (max 600 characters)</span>
            <textarea
              value={description}
              maxLength={600}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token?"
              className={`${inputCls} resize-y`}
            />
          </label>

          <div className="mb-4 flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-dim">Links (https only, max 10)</span>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={l.type ?? "website"}
                  onChange={(e) => setLink(i, { type: e.target.value })}
                  className={inputCls}
                >
                  {LINK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                  className="rounded-lg border border-line px-3 text-sm text-ink-dim hover:border-ink-dim hover:text-ink"
                >
                  ✕
                </button>
              </div>
            ))}
            {links.length < 10 && (
              <button
                onClick={() => setLinks((ls) => [...ls, { type: "website", url: "" }])}
                className="self-start rounded-lg border border-line px-3 py-2 text-[13px] text-ink-dim hover:border-ink-dim hover:text-ink"
              >
                + Add link
              </button>
            )}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-accent px-6 py-3 font-bold text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </section>
      )}

      {msg && <p className={msg.kind === "ok" ? "text-accent" : "text-danger"}>{msg.text}</p>}

      <section className="rounded-xl border border-line bg-card p-5">
        <h3 className="mb-2 font-semibold">For integrators</h3>
        <p className="text-sm text-ink-dim">This data is publicly available right away:</p>
        <code className="my-2 block overflow-x-auto rounded-lg border border-line bg-bg-soft px-3.5 py-2.5 font-mono text-[13px]">
          GET /token-profiles/solana/{address}
        </code>
        <Link to="/docs" className="text-sm text-ink-dim hover:text-ink">
          → full API documentation
        </Link>
      </section>
    </div>
  );
}

// Fair Drop browser crypto. Byte-for-byte the same formats as the Go backend and verifier/verify.py
// (docs/CRYPTOGRAPHY.md; cross-checked against docs/test-vectors.json in fdcrypto.test.ts).
// Hashing uses @noble/hashes so it also works on plain-http origins where crypto.subtle is unavailable.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils.js";

export type Entry = [string, string]; // [receiptId, tier]
export type ProofStep = { hash: string; left: boolean };

const u8 = (...n: number[]) => Uint8Array.from(n);
const td = (s: string) => utf8ToBytes(s);

export const toHex = bytesToHex;
export const fromHex = hexToBytes;
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function receiptId(dropId: string, tokenMsg: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(td("fairdrop/receipt/v1\x00"), td(dropId), u8(0), tokenMsg)));
}
export const leafHash = (rid: string, tier: string) => sha256(concatBytes(u8(0), td(rid), u8(0x1f), td(tier)));
export const nodeHash = (l: Uint8Array, r: Uint8Array) => sha256(concatBytes(u8(1), l, r));
export const EMPTY_ROOT = sha256(td("fairdrop/empty/v1"));

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // bytewise on ASCII hex == Go's string order

export function buildLevels(entries: Entry[]) {
  const es = [...entries].sort((a, b) => cmp(a[0], b[0]));
  let level: Uint8Array[] = es.map(([r, t]) => leafHash(r, t));
  const levels: Uint8Array[][] = [level];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(nodeHash(level[i], i + 1 < level.length ? level[i + 1] : level[i]));
    levels.push(next);
    level = next;
  }
  return { entries: es, levels };
}
export const rootOf = (levels: Uint8Array[][], n: number) => (n === 0 ? EMPTY_ROOT : levels[levels.length - 1][0]);

export function proofFor(levels: Uint8Array[][], idx: number): ProofStep[] {
  const path: ProofStep[] = [];
  for (let lv = 0; lv < levels.length - 1; lv++) {
    const sib = idx ^ 1;
    const s = sib < levels[lv].length ? levels[lv][sib] : levels[lv][idx];
    path.push({ hash: bytesToHex(s), left: sib < idx });
    idx = Math.floor(idx / 2);
  }
  return path;
}

export function verifyProof(rid: string, tier: string, path: ProofStep[], rootHex: string): boolean {
  let cur = leafHash(rid, tier);
  for (const s of path) {
    const sib = hexToBytes(s.hash);
    cur = s.left ? nodeHash(sib, cur) : nodeHash(cur, sib);
  }
  return bytesToHex(cur) === rootHex;
}

export function finalRandomness(seed: Uint8Array, root: Uint8Array, beacon?: Uint8Array | null): Uint8Array {
  return sha256(concatBytes(td("fairdrop/final/v1"), seed, root, beacon ? concatBytes(u8(1), beacon) : u8(0)));
}
export const score = (final: Uint8Array, rid: string) => bytesToHex(sha256(concatBytes(td("fairdrop/score/v1"), final, td(rid))));
export function order(final: Uint8Array, ids: string[]): string[] {
  return ids.map((id) => [score(final, id), id] as const).sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])).map((x) => x[1]);
}

// ---------------- full-bundle verification (what the /verify page runs) ----------------
export type Bundle = {
  drop_id: string; seed_hash: string; seed: string; merkle_root: string; entry_count: number;
  beacon: { round: number; randomness: string; signature: string } | null; final_randomness: string;
  tiers: { id: string; seats: number }[]; entries: Entry[]; results: Record<string, string[]>;
};
export type Check = { name: string; ok: boolean; detail?: string };

export function verifyBundle(b: Bundle, receipt?: string, rootAtLock?: string): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const chk = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const seed = hexToBytes(b.seed);
  chk("Seed commitment: SHA-256(seed) equals the seed hash published before the drop", bytesToHex(sha256(seed)) === b.seed_hash);
  chk("Entry list has unique receipt ids", new Set(b.entries.map((e) => e[0])).size === b.entries.length);
  const { entries, levels } = buildLevels(b.entries);
  const root = rootOf(levels, entries.length);
  chk("Merkle root recomputed from the full entry list equals the published root", bytesToHex(root) === b.merkle_root, bytesToHex(root).slice(0, 16) + "…");
  if (rootAtLock) chk("Root equals the root you saw when the list was locked (before the seed reveal)", bytesToHex(root) === rootAtLock);
  const beacon = b.beacon ? hexToBytes(b.beacon.randomness) : null;
  const fin = finalRandomness(seed, root, beacon);
  chk("Final randomness = SHA-256(seed ‖ root ‖ beacon) recomputed", bytesToHex(fin) === b.final_randomness, beacon ? `incl. drand round ${b.beacon!.round}` : "no beacon");
  const byTier: Record<string, string[]> = {};
  for (const [r, t] of entries) (byTier[t] ||= []).push(r);
  for (const t of b.tiers) {
    const want = order(fin, byTier[t.id] || []);
    const got = b.results[t.id] || [];
    chk(`Tier ${t.id}: winners and waitlist order recomputed from scores`, want.length === got.length && want.every((x, i) => x === got[i]), `${want.length} entries, ${t.seats} seats`);
  }
  if (receipt) {
    const idx = entries.findIndex((e) => e[0] === receipt);
    if (idx < 0) chk("YOUR RECEIPT IS IN THE LOCKED LIST", false, "Your signed receipt is missing from the Merkle tree: evidence of server misconduct");
    else {
      chk("Your receipt has a valid Merkle inclusion proof", verifyProof(entries[idx][0], entries[idx][1], proofFor(levels, idx), b.merkle_root));
      const tier = entries[idx][1];
      const pos = b.results[tier].indexOf(receipt) + 1;
      const seats = b.tiers.find((x) => x.id === tier)!.seats;
      chk("Your outcome, recomputed in your browser", true, `tier ${tier}: rank ${pos} → ${pos <= seats ? "WON" : `waitlist #${pos - seats}`}`);
    }
  }
  return { ok: checks.every((c) => c.ok), checks };
}

// ---------------- RFC 9474 blind-signature token flow (RSABSSA-SHA384-PSS-Deterministic) ----------------
export type TokenMaterial = { token_msg: string; sig: string };

export async function blindToken(jwk: JsonWebKey, mode: string) {
  const msg = crypto.getRandomValues(new Uint8Array(32));
  if (mode === "plain") return { msg, blinded: msg, finalize: async (blindSig: Uint8Array) => blindSig };
  const { RSABSSA } = await import("@cloudflare/blindrsa-ts");
  const suite = RSABSSA.SHA384.PSS.Deterministic();
  const pub = await crypto.subtle.importKey("jwk", { ...jwk, alg: "PS384", ext: true }, { name: "RSA-PSS", hash: "SHA-384" }, true, ["verify"]);
  const prepared = suite.prepare(msg);
  const { blindedMsg, inv } = await suite.blind(pub, prepared);
  return { msg, blinded: blindedMsg, finalize: async (blindSig: Uint8Array) => new Uint8Array(await suite.finalize(pub, prepared, blindSig, inv)) };
}

export async function verifyReceiptSig(ecSpkiB64: string, dropId: string, rid: string, tier: string, arrival: number, sigB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", unb64(ecSpkiB64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const msg = td(`fairdrop/receipt-sig/v1|${dropId}|${rid}|${tier}|${arrival}`);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64(sigB64), msg);
  } catch {
    return false;
  }
}

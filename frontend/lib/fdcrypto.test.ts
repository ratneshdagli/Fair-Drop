import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fd from "./fdcrypto";

const V = JSON.parse(readFileSync(resolve(__dirname, "../../docs/test-vectors.json"), "utf8"));

describe("browser crypto agrees with the Go backend (docs/test-vectors.json)", () => {
  it("receipt id", () => {
    const r = V.receipt_id;
    expect(fd.receiptId(r.drop_id, fd.fromHex(r.token_hex))).toBe(r.receipt_id);
  });
  for (const c of V.cases) {
    it(`merkle root, proof, final randomness and ordering for n=${c.entries.length}`, () => {
      const entries = c.entries.map((e: any) => [e.receipt_id, e.tier] as fd.Entry);
      const { entries: es, levels } = fd.buildLevels(entries);
      const root = fd.rootOf(levels, es.length);
      expect(fd.toHex(root)).toBe(c.root);
      const fin = fd.finalRandomness(fd.fromHex(c.seed), root, c.beacon ? fd.fromHex(c.beacon) : null);
      expect(fd.toHex(fin)).toBe(c.final);
      const by: Record<string, string[]> = {};
      for (const [r, t] of es) (by[t] ||= []).push(r);
      for (const t of c.tiers) expect(fd.order(fin, by[t.tier])).toEqual(t.order);
      const path = fd.proofFor(levels, c.proof_index);
      expect(path).toEqual(c.proof);
      expect(fd.verifyProof(es[c.proof_index][0], es[c.proof_index][1], path, c.root)).toBe(true);
      expect(fd.verifyProof(es[c.proof_index][0], "other", path, c.root)).toBe(false);
    });
  }
  it("verifyBundle detects a dropped entry and accepts the honest bundle", () => {
    const c = V.cases[V.cases.length - 1];
    const entries = c.entries.map((e: any) => [e.receipt_id, e.tier] as fd.Entry);
    const { levels, entries: es } = fd.buildLevels(entries);
    const seed = c.seed;
    const mk = (list: fd.Entry[]) => {
      const L = fd.buildLevels(list);
      const root = fd.rootOf(L.levels, L.entries.length);
      const fin = fd.finalRandomness(fd.fromHex(seed), root, null);
      const by: Record<string, string[]> = {};
      for (const [r, t] of L.entries) (by[t] ||= []).push(r);
      const results: Record<string, string[]> = {};
      for (const t of Object.keys(by)) results[t] = fd.order(fin, by[t]);
      return { drop_id: "d1", seed_hash: fd.toHex(require("@noble/hashes/sha2.js").sha256(fd.fromHex(seed))), seed, merkle_root: fd.toHex(root), entry_count: list.length, beacon: null, final_randomness: fd.toHex(fin),
        tiers: Object.keys(by).map((id) => ({ id, seats: 3 })), entries: L.entries, results } as fd.Bundle;
    };
    const honest = mk(entries);
    expect(fd.verifyBundle(honest, es[5][0]).ok).toBe(true);
    const victim = es[5][0];
    const cheated = mk(entries.filter((e: any) => e[0] !== victim)); // server silently drops one entry, builds a self-consistent bundle
    const r = fd.verifyBundle(cheated, victim);
    expect(r.ok).toBe(false);
    expect(r.checks.find((x) => x.name.startsWith("YOUR RECEIPT"))?.ok).toBe(false);
    // and a root that differs from the one seen at lock time is caught for everybody
    expect(fd.verifyBundle(cheated, undefined, honest.merkle_root).ok).toBe(false);
    void levels;
  });
});

const BASE = process.env.FD_BASE || "http://localhost:8088/api";
describe.skipIf(!process.env.FD_E2E)("RFC 9474 blind signature: browser library <-> Go server", () => {
  it("blinds in JS, Go signs blind, JS finalizes, Go verifies at /register, receipt signature verifies in WebCrypto", async () => {
    const j = async (r: Response) => { const t = await r.text(); if (!r.ok) throw new Error(r.status + " " + t); return JSON.parse(t); };
    const post = (p: string, body: any, h: any = {}) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) }).then(j);
    const adm = (await post("/test/admin-token", {}, { "X-Test-Key": "test-key-demo" })).token;
    const ah = { Authorization: "Bearer " + adm };
    const ev = await post("/admin/events", { name: "Blind e2e", venue: "v", tiers: [{ name: "Gold", price_cents: 1, seats: 2 }] }, ah);
    const cutoff = new Date(Date.now() + 3600e3).toISOString();
    const drop = await post("/admin/drops", { event_id: ev.id, window_sec: 600, cutoff_at: cutoff }, ah);
    for (let i = 0; i < 40; i++) { const d = await fetch(`${BASE}/drops/${drop.id}`).then(j); if (d.state === "OPEN") break; await new Promise((r) => setTimeout(r, 250)); }
    const phone = "+1555" + Math.floor(Math.random() * 1e7);
    const otp = (await post("/auth/otp", { phone })).otp;
    const sess = await post("/auth/verify", { phone, otp });
    const d = await fetch(`${BASE}/drops/${drop.id}`).then(j);
    expect(d.token_mode).toBe("blind");
    const { msg, blinded, finalize } = await fd.blindToken(d.public_key_jwk, d.token_mode);
    const bs = await post(`/drops/${drop.id}/token`, { blinded_msg: fd.b64(blinded), tier: "gold" }, { Authorization: "Bearer " + sess.token });
    const sig = await finalize(fd.unb64(bs.blind_sig));
    const rec = await post(`/drops/${drop.id}/register`, { token_msg: fd.b64(msg), sig: fd.b64(sig), tier: "gold" }, { "Idempotency-Key": "e2e-1" });
    expect(rec.receipt_id).toBe(fd.receiptId(drop.id, msg)); // browser and Go derive the same receipt id
    expect(await fd.verifyReceiptSig(d.receipt_public_key, drop.id, rec.receipt_id, rec.tier, rec.arrival_ms, rec.server_sig)).toBe(true);
    // second token for the same identity is refused
    const again = await fetch(`${BASE}/drops/${drop.id}/token`, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + sess.token }, body: JSON.stringify({ blinded_msg: fd.b64(blinded), tier: "gold" }) });
    expect(again.status).toBe(200); // same blinded message = safe retry
    const other = await fd.blindToken(d.public_key_jwk, d.token_mode);
    const again2 = await fetch(`${BASE}/drops/${drop.id}/token`, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + sess.token }, body: JSON.stringify({ blinded_msg: fd.b64(other.blinded), tier: "gold" }) });
    expect(again2.status).toBe(409);
  }, 60000);
});

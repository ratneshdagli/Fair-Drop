#!/usr/bin/env python3
"""Fair Drop reference verifier (stdlib only). Third implementation of the frozen formats
(Go backend, browser TypeScript, this script) - see docs/CRYPTOGRAPHY.md.

  python verifier/verify.py --url http://localhost:8088/api --drop DROP_ID [--receipt RECEIPT_ID] [--root ROOT_SEEN_AT_LOCK]
  python verifier/verify.py --file bundle.json
Exit code 0 = everything verified, 1 = inconsistency detected.
"""
import argparse, hashlib, json, sys, urllib.request

def sha(b: bytes) -> bytes: return hashlib.sha256(b).digest()

def leaf_hash(rid: str, tier: str) -> bytes: return sha(b"\x00" + rid.encode() + b"\x1f" + tier.encode())
def node_hash(l: bytes, r: bytes) -> bytes: return sha(b"\x01" + l + r)
EMPTY_ROOT = sha(b"fairdrop/empty/v1")

def build_levels(entries):
    es = sorted(entries, key=lambda e: e[0])
    level = [leaf_hash(r, t) for r, t in es]
    levels = [level]
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            l = level[i]; r = level[i + 1] if i + 1 < len(level) else l
            nxt.append(node_hash(l, r))
        levels.append(nxt); level = nxt
    return es, levels

def root_of(levels, n): return EMPTY_ROOT if n == 0 else levels[-1][0]

def proof(levels, idx):
    path = []
    for lv in range(len(levels) - 1):
        sib = idx ^ 1
        s = levels[lv][sib] if sib < len(levels[lv]) else levels[lv][idx]
        path.append({"hash": s.hex(), "left": sib < idx}); idx //= 2
    return path

def verify_proof(rid, tier, path, root_hex):
    cur = leaf_hash(rid, tier)
    for s in path:
        sib = bytes.fromhex(s["hash"]); cur = node_hash(sib, cur) if s["left"] else node_hash(cur, sib)
    return cur.hex() == root_hex

def final_randomness(seed: bytes, root: bytes, beacon: bytes | None) -> bytes:
    return sha(b"fairdrop/final/v1" + seed + root + (b"\x01" + beacon if beacon else b"\x00"))

def score(final: bytes, rid: str) -> bytes: return sha(b"fairdrop/score/v1" + final + rid.encode())

def order(final: bytes, ids): return sorted(ids, key=lambda i: (score(final, i), i))

def receipt_id(drop_id: str, token_msg: bytes) -> str:
    return sha(b"fairdrop/receipt/v1\x00" + drop_id.encode() + b"\x00" + token_msg).hex()

def verify_bundle(b, receipt=None, root_at_lock=None):
    """Returns (ok, checks[list of (name, ok, detail)])."""
    checks = []
    def chk(name, ok, detail=""): checks.append((name, bool(ok), detail))
    seed = bytes.fromhex(b["seed"])
    chk("seed commitment: sha256(seed) == published seed_hash", sha(seed).hex() == b["seed_hash"])
    entries = [tuple(e) for e in b["entries"]]
    chk("entry list has unique receipt ids", len({e[0] for e in entries}) == len(entries))
    es, levels = build_levels(entries)
    root = root_of(levels, len(es))
    chk("merkle root recomputed from entry list == published root", root.hex() == b["merkle_root"], root.hex())
    if root_at_lock:
        chk("root equals the root observed when the list was locked (before seed reveal)", root.hex() == root_at_lock)
    beacon = bytes.fromhex(b["beacon"]["randomness"]) if b.get("beacon") else None
    final = final_randomness(seed, root, beacon)
    chk("final randomness = H(seed || root || beacon)", final.hex() == b["final_randomness"], "beacon" if beacon else "no beacon")
    by_tier = {}
    for rid, t in es: by_tier.setdefault(t, []).append(rid)
    for t in b["tiers"]:
        want = order(final, by_tier.get(t["id"], []))
        chk(f"tier {t['id']}: winner order + waitlist recomputed from scores", want == b["results"].get(t["id"], []), f"{len(want)} entries, {t['seats']} seats")
    if receipt:
        idx = next((i for i, e in enumerate(es) if e[0] == receipt), -1)
        if idx < 0:
            chk("YOUR RECEIPT IS IN THE LOCKED LIST", False, "receipt missing from the Merkle tree -> evidence of server misconduct if you hold a signed receipt")
        else:
            chk("your receipt has a valid Merkle inclusion proof", verify_proof(es[idx][0], es[idx][1], proof(levels, idx), b["merkle_root"]))
            t = es[idx][1]; pos = b["results"][t].index(receipt) + 1
            seats = next(x["seats"] for x in b["tiers"] if x["id"] == t)
            chk("your outcome recomputed", True, f"tier {t}: rank {pos} -> {'WON' if pos <= seats else 'waitlist #%d' % (pos - seats)}")
    return all(c[1] for c in checks), checks

def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r: return json.load(r)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url"); ap.add_argument("--drop"); ap.add_argument("--file"); ap.add_argument("--receipt"); ap.add_argument("--root")
    a = ap.parse_args()
    b = json.load(open(a.file)) if a.file else fetch(f"{a.url}/drops/{a.drop}/verify")
    ok, checks = verify_bundle(b, a.receipt, a.root)
    for n, o, d in checks: print(("PASS " if o else "FAIL ") + n + (f"  [{d}]" if d else ""))
    print("\nRESULT:", "VERIFIED" if ok else "INCONSISTENCY DETECTED")
    sys.exit(0 if ok else 1)

if __name__ == "__main__": main()

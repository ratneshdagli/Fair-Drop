package fdcrypto

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

func mk(n int) []Entry {
	es := make([]Entry, n)
	for i := range es {
		es[i] = Entry{ReceiptID: ReceiptID("d1", []byte(fmt.Sprintf("tok-%d", i))), Tier: []string{"gold", "silver", "general"}[i%3]}
	}
	return es
}

func TestMerkleSizes(t *testing.T) {
	for _, n := range []int{0, 1, 2, 3, 5, 7, 8, 1000, 4097, 50000} {
		es := mk(n)
		tr, err := BuildTree(es)
		if err != nil {
			t.Fatal(err)
		}
		root := tr.Root()
		step := 1
		if n > 1000 {
			step = n / 97
		}
		for i := 0; i < n; i += step {
			if !VerifyProof(tr.Entries[i], tr.Proof(i), root) {
				t.Fatalf("n=%d i=%d proof failed", n, i)
			}
		}
		if n > 0 {
			bad := tr.Entries[0]
			bad.Tier = "other"
			if VerifyProof(bad, tr.Proof(0), root) {
				t.Fatal("tier tamper not detected")
			}
		}
	}
}

func TestMerkleOrderIndependentAndDuplicates(t *testing.T) {
	es := mk(100)
	a, _ := BuildTree(es)
	rev := make([]Entry, len(es))
	for i := range es {
		rev[len(es)-1-i] = es[i]
	}
	b, _ := BuildTree(rev)
	if a.Root() != b.Root() {
		t.Fatal("root depends on input order")
	}
	if _, err := BuildTree(append(es, es[3])); err != ErrDuplicate {
		t.Fatal("duplicates must be rejected")
	}
	c, _ := BuildTree(es[1:])
	if a.Root() == c.Root() || c.Index(es[0].ReceiptID) != -1 {
		t.Fatal("dropped entry not reflected")
	}
}

func TestDrawDeterministic(t *testing.T) {
	es := mk(500)
	tr, _ := BuildTree(es)
	seed := []byte("0123456789abcdef0123456789abcdef")
	f1 := FinalRandomness(seed, tr.Root(), nil)
	if f1 != FinalRandomness(seed, tr.Root(), nil) {
		t.Fatal("nondeterministic")
	}
	if f1 == FinalRandomness(seed, tr.Root(), make([]byte, 32)) {
		t.Fatal("beacon ignored")
	}
	ids := make([]string, len(tr.Entries))
	for i, e := range tr.Entries {
		ids[i] = e.ReceiptID
	}
	o1, o2 := Order(f1, ids), Order(f1, ids)
	for i := range o1 {
		if o1[i] != o2[i] {
			t.Fatal("order differs")
		}
	}
}

func TestBlindFlowAndPlainFallback(t *testing.T) {
	k, err := NewIssuerKey()
	if err != nil {
		t.Fatal(err)
	}
	ser, _ := k.Serialize()
	k2, err := ParseIssuerKey(ser)
	if err != nil || k2.RSA.N.Cmp(k.RSA.N) != 0 {
		t.Fatal("key roundtrip", err)
	}
	tok := make([]byte, 32)
	rand.Read(tok)
	blinded, st, c, err := ClientBlind(&k.RSA.PublicKey, tok)
	if err != nil {
		t.Fatal(err)
	}
	bs, err := k.BlindSign(blinded)
	if err != nil {
		t.Fatal(err)
	}
	bs2, _ := k.BlindSign(blinded)
	if hex.EncodeToString(bs) != hex.EncodeToString(bs2) {
		t.Fatal("blind sign must be deterministic (retry safety)")
	}
	sig, err := c.Finalize(st, bs)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyToken(&k.RSA.PublicKey, tok, sig); err != nil {
		t.Fatal("blind sig invalid:", err)
	}
	tok2 := append([]byte{}, tok...)
	tok2[0] ^= 1
	if VerifyToken(&k.RSA.PublicKey, tok2, sig) == nil {
		t.Fatal("sig valid for other msg")
	}
	ps, _ := k.PlainSign(tok)
	if err := VerifyToken(&k.RSA.PublicKey, tok, ps); err != nil {
		t.Fatal("plain fallback must verify identically:", err)
	}
	m := ReceiptMessage("d", "r", "gold", 5)
	s, _ := SignEC(k.EC, m)
	if !VerifyEC(&k.EC.PublicKey, m, s) || VerifyEC(&k.EC.PublicKey, ReceiptMessage("d", "r", "gold", 6), s) {
		t.Fatal("ec")
	}
}

// TestWriteVectors regenerates docs/test-vectors.json (consumed by the JS and Python tests).
// Run with WRITE_VECTORS=path.
func TestWriteVectors(t *testing.T) {
	path := os.Getenv("WRITE_VECTORS")
	if path == "" {
		t.Skip()
	}
	type tier struct {
		Tier  string   `json:"tier"`
		Seats int      `json:"seats"`
		Order []string `json:"order"`
	}
	var cases []map[string]any
	for _, n := range []int{1, 2, 3, 7, 64, 1001} {
		es := mk(n)
		tr, _ := BuildTree(es)
		seed := []byte(fmt.Sprintf("seed-vector-%032d", n))[:32]
		var beacon []byte
		if n%2 == 0 {
			beacon = make([]byte, 32)
			for i := range beacon {
				beacon[i] = byte(i + n)
			}
		}
		root := tr.Root()
		fin := FinalRandomness(seed, root, beacon)
		byTier := map[string][]string{}
		for _, e := range tr.Entries {
			byTier[e.Tier] = append(byTier[e.Tier], e.ReceiptID)
		}
		var ts []tier
		for _, tn := range []string{"gold", "silver", "general"} {
			if ids := byTier[tn]; len(ids) > 0 {
				ts = append(ts, tier{tn, 1 + n/10, Order(fin, ids)})
			}
		}
		idx := n / 2
		cases = append(cases, map[string]any{
			"drop_id": "d1", "entries": tr.Entries, "seed": hex.EncodeToString(seed),
			"beacon": hex.EncodeToString(beacon), "root": hex.EncodeToString(root[:]),
			"final": hex.EncodeToString(fin[:]), "tiers": ts,
			"proof_index": idx, "proof": tr.Proof(idx),
		})
	}
	out := map[string]any{"cases": cases,
		"receipt_id": map[string]string{"drop_id": "d1", "token_hex": hex.EncodeToString([]byte("tok-0")), "receipt_id": ReceiptID("d1", []byte("tok-0"))}}
	b, _ := json.MarshalIndent(out, "", " ")
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

// Package fdcrypto holds every cryptographic primitive Fair Drop publishes.
// Encodings here are the frozen contract shared with frontend/lib/fdcrypto.ts
// and verifier/verify.py (see docs/CRYPTOGRAPHY.md and docs/test-vectors.json).
package fdcrypto

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
)

// Entry is one locked-list element. The tier is part of the leaf so the
// server cannot move an entry between tiers after the lock.
type Entry struct {
	ReceiptID string `json:"receipt_id"`
	Tier      string `json:"tier"`
}

// ProofStep: Left=true means the sibling hash sits to the LEFT of the running hash.
type ProofStep struct {
	Hash string `json:"hash"`
	Left bool   `json:"left"`
}

// ReceiptID = hex(SHA256("fairdrop/receipt/v1\x00" || dropID || 0x00 || tokenMsg)).
// Derived from the token secret, so a retry of the same token yields the same receipt
// and the server cannot link it to an account (blind signature hides the token at issuance).
func ReceiptID(dropID string, tokenMsg []byte) string {
	h := sha256.New()
	h.Write([]byte("fairdrop/receipt/v1\x00"))
	h.Write([]byte(dropID))
	h.Write([]byte{0})
	h.Write(tokenMsg)
	return hex.EncodeToString(h.Sum(nil))
}

// LeafHash = SHA256(0x00 || receiptID || 0x1f || tier)
func LeafHash(e Entry) [32]byte {
	h := sha256.New()
	h.Write([]byte{0x00})
	h.Write([]byte(e.ReceiptID))
	h.Write([]byte{0x1f})
	h.Write([]byte(e.Tier))
	var o [32]byte
	copy(o[:], h.Sum(nil))
	return o
}

// NodeHash = SHA256(0x01 || left || right)
func NodeHash(l, r [32]byte) [32]byte {
	h := sha256.New()
	h.Write([]byte{0x01})
	h.Write(l[:])
	h.Write(r[:])
	var o [32]byte
	copy(o[:], h.Sum(nil))
	return o
}

// EmptyRoot is the root of a drop with no entries.
func EmptyRoot() [32]byte { return sha256.Sum256([]byte("fairdrop/empty/v1")) }

type Tree struct {
	Entries []Entry // sorted by ReceiptID
	Levels  [][][32]byte
}

var ErrDuplicate = errors.New("duplicate receipt id")

// BuildTree sorts a copy of entries by receipt id (bytewise) and builds the tree.
// An odd node at any level is paired with itself.
func BuildTree(in []Entry) (*Tree, error) {
	es := append([]Entry(nil), in...)
	sort.Slice(es, func(i, j int) bool { return es[i].ReceiptID < es[j].ReceiptID })
	for i := 1; i < len(es); i++ {
		if es[i].ReceiptID == es[i-1].ReceiptID {
			return nil, ErrDuplicate
		}
	}
	t := &Tree{Entries: es}
	level := make([][32]byte, len(es))
	for i, e := range es {
		level[i] = LeafHash(e)
	}
	t.Levels = append(t.Levels, level)
	for len(level) > 1 {
		next := make([][32]byte, (len(level)+1)/2)
		for i := range next {
			l := level[2*i]
			r := l
			if 2*i+1 < len(level) {
				r = level[2*i+1]
			}
			next[i] = NodeHash(l, r)
		}
		t.Levels = append(t.Levels, next)
		level = next
	}
	return t, nil
}

func (t *Tree) Root() [32]byte {
	if len(t.Entries) == 0 {
		return EmptyRoot()
	}
	return t.Levels[len(t.Levels)-1][0]
}

// Index returns the position of a receipt in the sorted list, or -1.
func (t *Tree) Index(receiptID string) int {
	i := sort.Search(len(t.Entries), func(i int) bool { return t.Entries[i].ReceiptID >= receiptID })
	if i < len(t.Entries) && t.Entries[i].ReceiptID == receiptID {
		return i
	}
	return -1
}

func (t *Tree) Proof(idx int) []ProofStep {
	p := []ProofStep{}
	for lv := 0; lv < len(t.Levels)-1; lv++ {
		level := t.Levels[lv]
		sib := idx ^ 1
		var s [32]byte
		if sib < len(level) {
			s = level[sib]
		} else {
			s = level[idx]
		}
		p = append(p, ProofStep{Hash: hex.EncodeToString(s[:]), Left: sib < idx})
		idx /= 2
	}
	return p
}

func VerifyProof(e Entry, path []ProofStep, root [32]byte) bool {
	cur := LeafHash(e)
	for _, s := range path {
		b, err := hex.DecodeString(s.Hash)
		if err != nil || len(b) != 32 {
			return false
		}
		var sib [32]byte
		copy(sib[:], b)
		if s.Left {
			cur = NodeHash(sib, cur)
		} else {
			cur = NodeHash(cur, sib)
		}
	}
	return bytes.Equal(cur[:], root[:])
}

// ---- draw ----

// FinalRandomness = SHA256("fairdrop/final/v1" || seed || merkleRoot || flag || beacon?)
// flag = 0x00 (no beacon) or 0x01 followed by the 32-byte beacon randomness.
func FinalRandomness(seed []byte, root [32]byte, beacon []byte) [32]byte {
	h := sha256.New()
	h.Write([]byte("fairdrop/final/v1"))
	h.Write(seed)
	h.Write(root[:])
	if len(beacon) > 0 {
		h.Write([]byte{1})
		h.Write(beacon)
	} else {
		h.Write([]byte{0})
	}
	var o [32]byte
	copy(o[:], h.Sum(nil))
	return o
}

// Score = SHA256("fairdrop/score/v1" || final || id). Lower wins. `id` is a receipt id
// (or an attempt id in the counterfactual naive lottery).
func Score(final [32]byte, id string) [32]byte {
	h := sha256.New()
	h.Write([]byte("fairdrop/score/v1"))
	h.Write(final[:])
	h.Write([]byte(id))
	var o [32]byte
	copy(o[:], h.Sum(nil))
	return o
}

// Order returns ids sorted by ascending score (ties broken by id). Winners are the first N.
func Order(final [32]byte, ids []string) []string {
	type sc struct {
		id string
		s  [32]byte
	}
	xs := make([]sc, len(ids))
	for i, id := range ids {
		xs[i] = sc{id, Score(final, id)}
	}
	sort.Slice(xs, func(i, j int) bool {
		if c := bytes.Compare(xs[i].s[:], xs[j].s[:]); c != 0 {
			return c < 0
		}
		return xs[i].id < xs[j].id
	})
	out := make([]string, len(xs))
	for i := range xs {
		out[i] = xs[i].id
	}
	return out
}

// drand quicknet (unchained, 3s period).
const (
	DrandGenesis = 1692803367
	DrandPeriod  = 3
	DrandChain   = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
)

// DrandRoundAfter returns the first quicknet round whose publication time is strictly after unix.
func DrandRoundAfter(unix int64) uint64 {
	if unix < DrandGenesis {
		return 1
	}
	return uint64((unix-DrandGenesis)/DrandPeriod) + 2
}

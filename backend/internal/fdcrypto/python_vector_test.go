package fdcrypto

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"os"
	"testing"
)

// The attack engine's CRYPTO_SWARM bot does RFC 9474 blinding in Python (attack_engine/blindrsa.py). This checks a token
// made that way (docs/blindrsa-python-vector.json, throw-away key, public data only) with the REAL server verifier.
func TestPythonBlindedTokenVerifiesWithServerVerifier(t *testing.T) {
	raw, err := os.ReadFile("../../../docs/blindrsa-python-vector.json")
	if err != nil {
		t.Skip("no python vector file: ", err)
	}
	var v struct {
		JWK      map[string]string `json:"public_key_jwk"`
		TokenMsg string            `json:"token_msg"`
		Sig      string            `json:"sig"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	nb, err1 := base64.RawURLEncoding.DecodeString(v.JWK["n"])
	eb, err2 := base64.RawURLEncoding.DecodeString(v.JWK["e"])
	msg, err3 := base64.StdEncoding.DecodeString(v.TokenMsg)
	sig, err4 := base64.StdEncoding.DecodeString(v.Sig)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		t.Fatal("bad vector encoding")
	}
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(new(big.Int).SetBytes(eb).Int64())}
	if err := VerifyToken(pub, msg, sig); err != nil {
		t.Fatal("a Python-blinded token must verify with the server verifier:", err)
	}
	bad := append([]byte{}, msg...)
	bad[0] ^= 1
	if VerifyToken(pub, bad, sig) == nil {
		t.Fatal("tampered token message accepted")
	}
	badSig := append([]byte{}, sig...)
	badSig[len(badSig)-1] ^= 1
	if VerifyToken(pub, msg, badSig) == nil {
		t.Fatal("tampered signature accepted")
	}
}

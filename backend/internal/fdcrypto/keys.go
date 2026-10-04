package fdcrypto

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/cloudflare/circl/blindsign/blindrsa"
)

// Token scheme: RFC 9474 RSABSSA-SHA384-PSS-Deterministic, RSA-2048, one key per drop.
const TokenVariant = blindrsa.SHA384PSSDeterministic

type IssuerKey struct {
	RSA *rsa.PrivateKey
	EC  *ecdsa.PrivateKey // receipt/ticket signing key (P-256)
}

func NewIssuerKey() (*IssuerKey, error) {
	r, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	e, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return &IssuerKey{r, e}, nil
}

// Serialize: PKCS8 DER base64 of RSA and EC keys joined by ':'.
func (k *IssuerKey) Serialize() (string, error) {
	a, err := x509.MarshalPKCS8PrivateKey(k.RSA)
	if err != nil {
		return "", err
	}
	b, err := x509.MarshalPKCS8PrivateKey(k.EC)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(a) + ":" + base64.StdEncoding.EncodeToString(b), nil
}

func ParseIssuerKey(s string) (*IssuerKey, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return nil, errors.New("bad key blob")
	}
	a, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	b, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	ra, err := x509.ParsePKCS8PrivateKey(a)
	if err != nil {
		return nil, err
	}
	rb, err := x509.ParsePKCS8PrivateKey(b)
	if err != nil {
		return nil, err
	}
	return &IssuerKey{ra.(*rsa.PrivateKey), rb.(*ecdsa.PrivateKey)}, nil
}

func (k *IssuerKey) RSAPublicSPKI() string {
	d, _ := x509.MarshalPKIXPublicKey(&k.RSA.PublicKey)
	return base64.StdEncoding.EncodeToString(d)
}
func (k *IssuerKey) ECPublicSPKI() string {
	d, _ := x509.MarshalPKIXPublicKey(&k.EC.PublicKey)
	return base64.StdEncoding.EncodeToString(d)
}

// RSAPublicJWK returns {kty,n,e} (base64url) - the form browsers import most reliably.
func (k *IssuerKey) RSAPublicJWK() map[string]string {
	pk := k.RSA.PublicKey
	return map[string]string{
		"kty": "RSA",
		"n":   base64.RawURLEncoding.EncodeToString(pk.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pk.E)).Bytes()),
	}
}

// BlindSign signs a client-blinded message (RFC 9474 BlindSign). Deterministic: the
// same blinded message always yields the same blind signature, which makes retries safe.
func (k *IssuerKey) BlindSign(blinded []byte) ([]byte, error) {
	return blindrsa.NewSigner(k.RSA).BlindSign(blinded)
}

// PlainSign is the PRD fallback: sign the token directly (RSASSA-PSS/SHA-384/salt 48).
// The result verifies with VerifyToken exactly like an unblinded RFC 9474 signature,
// but the issuer sees the token (privacy property lost).
func (k *IssuerKey) PlainSign(tokenMsg []byte) ([]byte, error) {
	d := sha512.Sum384(tokenMsg)
	return rsa.SignPSS(rand.Reader, k.RSA, crypto.SHA384, d[:], &rsa.PSSOptions{SaltLength: 48})
}

func VerifyToken(pub *rsa.PublicKey, tokenMsg, sig []byte) error {
	v, err := blindrsa.NewVerifier(TokenVariant, pub)
	if err != nil {
		return err
	}
	return v.Verify(tokenMsg, sig)
}

// ClientBlind: server-side "client", used only by the TEST_MODE test-token endpoint.
func ClientBlind(pub *rsa.PublicKey, tokenMsg []byte) (blinded []byte, st blindrsa.State, c blindrsa.Client, err error) {
	c, err = blindrsa.NewClient(TokenVariant, pub)
	if err != nil {
		return
	}
	blinded, st, err = c.Blind(rand.Reader, tokenMsg)
	return
}

// ---- receipts / tickets (ECDSA P-256 over SHA-256, raw r||s) ----

func ReceiptMessage(drop, receipt, tier string, arrivalMS int64) []byte {
	return []byte(fmt.Sprintf("fairdrop/receipt-sig/v1|%s|%s|%s|%d", drop, receipt, tier, arrivalMS))
}
func TicketMessage(drop, receipt, tier string, seat int) []byte {
	return []byte(fmt.Sprintf("fairdrop/ticket-sig/v1|%s|%s|%s|%d", drop, receipt, tier, seat))
}

func SignEC(k *ecdsa.PrivateKey, msg []byte) ([]byte, error) {
	d := sha256.Sum256(msg)
	r, s, err := ecdsa.Sign(rand.Reader, k, d[:])
	if err != nil {
		return nil, err
	}
	out := make([]byte, 64)
	r.FillBytes(out[:32])
	s.FillBytes(out[32:])
	return out, nil
}

func VerifyEC(pub *ecdsa.PublicKey, msg, sig []byte) bool {
	if len(sig) != 64 {
		return false
	}
	d := sha256.Sum256(msg)
	return ecdsa.Verify(pub, d[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:]))
}

// ensure elliptic is referenced for P-256 parsing in callers
var _ = elliptic.P256

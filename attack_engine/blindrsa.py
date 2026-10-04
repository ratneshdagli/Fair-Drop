"""Client-side RFC 9474 blind RSA: RSABSSA-SHA384-PSS-Deterministic, RSA-2048. Pure Python (hashlib + big-int math), no
dependencies, so a load-generator process can do the real thing without the server's TEST_MODE shortcut.

Same variant as the Go server (circl blindrsa.SHA384PSSDeterministic) and the browser (@cloudflare/blindrsa-ts
RSABSSA.SHA384.PSS.Deterministic): hash SHA-384, MGF1-SHA-384, PSS salt 48 bytes, emBits = modulus_bits - 1, and
"Deterministic" = the message is NOT prefixed with a random value (the PSS salt itself is still random).

  blind(n, e, msg)                  -> (blinded_msg, inv)     client, step 1
  (server)  blind_sig = blinded_msg ^ d mod n                 issuer
  finalize(n, e, msg, blind_sig, inv) -> sig                  client, step 2 (also checks the result, as the RFC says)
  verify(n, e, msg, sig)            -> bool                   what /register does: a plain RSA-PSS verification
"""
from __future__ import annotations
import base64
import hashlib
import math
import secrets

HASH = hashlib.sha384
H_LEN = 48          # SHA-384 output
S_LEN = 48          # PSS salt length of the *PSS-Deterministic* variant


def pub_from_jwk(jwk: dict) -> tuple[int, int]:
    """The drop page publishes {kty, n, e} (base64url, no padding), see RSAPublicJWK in backend/internal/fdcrypto/keys.go."""
    def b(s: str) -> int:
        return int.from_bytes(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)), "big")
    return b(jwk["n"]), b(jwk["e"])


def _mgf1(seed: bytes, length: int) -> bytes:
    out, c = b"", 0
    while len(out) < length:
        out += HASH(seed + c.to_bytes(4, "big")).digest()
        c += 1
    return out[:length]


def _xor(a: bytes, b: bytes) -> bytearray:
    return bytearray(x ^ y for x, y in zip(a, b))


def emsa_pss_encode(msg: bytes, em_bits: int, salt: bytes | None = None) -> bytes:
    """RFC 8017 section 9.1.1."""
    em_len = (em_bits + 7) // 8
    if em_len < H_LEN + S_LEN + 2:
        raise ValueError("modulus too small")
    salt = secrets.token_bytes(S_LEN) if salt is None else salt
    h = HASH(b"\x00" * 8 + HASH(msg).digest() + salt).digest()
    db = b"\x00" * (em_len - S_LEN - H_LEN - 2) + b"\x01" + salt
    masked = _xor(db, _mgf1(h, em_len - H_LEN - 1))
    masked[0] &= 0xFF >> (8 * em_len - em_bits)
    return bytes(masked) + h + b"\xbc"


def emsa_pss_verify(msg: bytes, em: bytes, em_bits: int) -> bool:
    """RFC 8017 section 9.1.2."""
    em_len = (em_bits + 7) // 8
    if len(em) != em_len or em_len < H_LEN + S_LEN + 2 or em[-1] != 0xBC:
        return False
    zero_bits = 8 * em_len - em_bits
    masked, h = em[: em_len - H_LEN - 1], em[em_len - H_LEN - 1: -1]
    if masked[0] >> (8 - zero_bits):          # the leftmost bits must be zero (shift by 8 when there are none: always 0)
        return False
    db = _xor(masked, _mgf1(h, em_len - H_LEN - 1))
    db[0] &= 0xFF >> zero_bits
    ps = em_len - H_LEN - S_LEN - 2
    if any(db[:ps]) or db[ps] != 0x01:
        return False
    salt = bytes(db[-S_LEN:])
    return HASH(b"\x00" * 8 + HASH(msg).digest() + salt).digest() == h


def verify(n: int, e: int, msg: bytes, sig: bytes) -> bool:
    """RSASSA-PSS-VERIFY (RFC 8017): exactly what the server does for a ticket."""
    k = (n.bit_length() + 7) // 8
    if len(sig) != k:
        return False
    s = int.from_bytes(sig, "big")
    if s >= n:
        return False
    em_bits = n.bit_length() - 1
    try:
        em = pow(s, e, n).to_bytes((em_bits + 7) // 8, "big")
    except OverflowError:
        return False
    return emsa_pss_verify(msg, em, em_bits)


def blind(n: int, e: int, msg: bytes, salt: bytes | None = None, r: int | None = None) -> tuple[bytes, int]:
    """RFC 9474 Blind. `salt` and `r` are only for tests; normally both are fresh random values."""
    k = (n.bit_length() + 7) // 8
    m = int.from_bytes(emsa_pss_encode(msg, n.bit_length() - 1, salt), "big")
    if math.gcd(m, n) != 1:
        raise ValueError("invalid input")
    while True:
        rr = r if r is not None else secrets.randbelow(n - 1) + 1       # uniform in [1, n-1]
        try:
            inv = pow(rr, -1, n)
            break
        except ValueError:                                              # not invertible (never in practice): draw again
            if r is not None:
                raise ValueError("blinding error")
    z = (m * pow(rr, e, n)) % n
    return z.to_bytes(k, "big"), inv


def finalize(n: int, e: int, msg: bytes, blind_sig: bytes, inv: int) -> bytes:
    """RFC 9474 Finalize: unblind, then verify (a bad server answer must never become a 'ticket')."""
    k = (n.bit_length() + 7) // 8
    if len(blind_sig) != k:
        raise ValueError("unexpected input size")
    sig = ((int.from_bytes(blind_sig, "big") * inv) % n).to_bytes(k, "big")
    if not verify(n, e, msg, sig):
        raise ValueError("invalid signature")
    return sig


def blind_sign(n: int, d: int, blinded_msg: bytes) -> bytes:
    """What the issuer does (RSASP1). Only used by tests, which hold the private key; the server does this for real."""
    k = (n.bit_length() + 7) // 8
    return pow(int.from_bytes(blinded_msg, "big"), d, n).to_bytes(k, "big")

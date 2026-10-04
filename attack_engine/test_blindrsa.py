"""Offline tests for the client-side blind RSA and the clock estimate. No network.
Run: python -m pytest attack_engine/test_blindrsa.py     (needs `cryptography` for the independent OpenSSL cross-check)

What is checked, and against what:
  - a token blinded + finalized by OUR Python code verifies under OpenSSL's RSA-PSS (SHA-384, MGF1-SHA-384, salt 48): the
    same rule the Go server (circl blindrsa.SHA384PSSDeterministic) and the browser (RSABSSA.SHA384.PSS.Deterministic) use;
  - the reverse: an OpenSSL-made PSS signature passes OUR verifier (so our EMSA-PSS is the standard one, in both directions);
  - tampered message / signature / wrong key are rejected;
  - the request sizes the server enforces (blinded message = key size and < N, ticket 16..128 bytes);
  - docs/blindrsa-python-vector.json (made by this code, public data only) verifies. backend/internal/fdcrypto has a Go test
    that verifies the SAME file with the real server verifier.
"""
import base64
import json
import os
import secrets

import pytest

from attack_engine import blindrsa as br, timesync

crypto = pytest.importorskip("cryptography")
from cryptography.exceptions import InvalidSignature                       # noqa: E402
from cryptography.hazmat.primitives import hashes                           # noqa: E402
from cryptography.hazmat.primitives.asymmetric import padding, rsa          # noqa: E402

PSS = padding.PSS(mgf=padding.MGF1(hashes.SHA384()), salt_length=48)
VECTOR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "blindrsa-python-vector.json")


def b64u(i: int) -> str:
    return base64.urlsafe_b64encode(i.to_bytes((i.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def key():
    k = rsa.generate_private_key(65537, 2048)
    nums = k.private_numbers()
    return k, nums.public_numbers.n, nums.public_numbers.e, nums.d


def full_flow(n, e, d, msg=None):
    msg = msg or secrets.token_bytes(32)
    blinded, inv = br.blind(n, e, msg)
    sig = br.finalize(n, e, msg, br.blind_sign(n, d, blinded), inv)
    return msg, blinded, sig


def test_python_blinded_token_verifies_under_openssl_pss(key):
    k, n, e, d = key
    msg, blinded, sig = full_flow(n, e, d)
    k.public_key().verify(sig, msg, PSS, hashes.SHA384())          # raises if the signature is not a standard RSA-PSS one
    assert br.verify(n, e, msg, sig)
    assert len(sig) == 256


def test_openssl_pss_signature_passes_our_verifier(key):
    k, n, e, d = key
    for _ in range(5):
        msg = secrets.token_bytes(32)
        assert br.verify(n, e, msg, k.sign(msg, PSS, hashes.SHA384()))


def test_tampered_or_foreign_tokens_are_rejected(key):
    k, n, e, d = key
    msg, blinded, sig = full_flow(n, e, d)
    bad_msg = bytes([msg[0] ^ 1]) + msg[1:]
    bad_sig = sig[:-1] + bytes([sig[-1] ^ 1])
    with pytest.raises(InvalidSignature):
        k.public_key().verify(sig, bad_msg, PSS, hashes.SHA384())
    with pytest.raises(InvalidSignature):
        k.public_key().verify(bad_sig, msg, PSS, hashes.SHA384())
    assert not br.verify(n, e, bad_msg, sig) and not br.verify(n, e, msg, bad_sig)
    assert not br.verify(n, e, msg, sig[:-1]) and not br.verify(n, e, msg, b"\x00" * 256)
    other = rsa.generate_private_key(65537, 2048).private_numbers()
    assert not br.verify(other.public_numbers.n, other.public_numbers.e, msg, sig)       # a ticket from another sale / key
    with pytest.raises(ValueError):                                                         # a lying issuer never yields a 'ticket'
        blinded2, inv2 = br.blind(n, e, msg)
        br.finalize(n, e, msg, br.blind_sign(n, d, blinded2)[:-1] + b"\x00", inv2)


def test_server_input_rules(key):
    k, n, e, d = key
    msg, blinded, sig = full_flow(n, e, d)
    assert len(msg) == 32 and 16 <= len(msg) <= 128                         # register: 16..128 byte token
    assert len(blinded) == (n.bit_length() + 7) // 8 and int.from_bytes(blinded, "big") < n    # token: validBlinded in entry.go
    assert br.blind(n, e, msg)[0] != blinded                                # fresh randomness every time (unlinkable)
    assert int.from_bytes(blinded, "big") != int.from_bytes(br.emsa_pss_encode(msg, n.bit_length() - 1), "big")  # actually blinded
    jwk = {"kty": "RSA", "n": b64u(n), "e": b64u(e)}                         # the shape the drop page publishes
    assert br.pub_from_jwk(jwk) == (n, e) and jwk["e"] == "AQAB"


def test_deterministic_blinding_with_fixed_randomness(key):
    k, n, e, d = key
    msg = b"m" * 32
    a = br.blind(n, e, msg, salt=b"s" * 48, r=12345)
    b = br.blind(n, e, msg, salt=b"s" * 48, r=12345)
    assert a == b


def test_committed_vector_verifies():
    if not os.path.exists(VECTOR):
        pytest.skip("vector file not generated yet")
    v = json.load(open(VECTOR))
    n, e = br.pub_from_jwk(v["public_key_jwk"])
    msg, sig = base64.b64decode(v["token_msg"]), base64.b64decode(v["sig"])
    assert br.verify(n, e, msg, sig)
    rsa.RSAPublicNumbers(e, n).public_key().verify(sig, msg, PSS, hashes.SHA384())
    assert not br.verify(n, e, bytes([msg[0] ^ 1]) + msg[1:], sig)


def test_write_vector(key):
    """WRITE_VECTOR=docs/blindrsa-python-vector.json python -m pytest attack_engine/test_blindrsa.py -k write_vector"""
    path = os.environ.get("WRITE_VECTOR")
    if not path:
        pytest.skip()
    k, n, e, d = key
    msg, blinded, sig = full_flow(n, e, d)
    json.dump({"note": "made by attack_engine/blindrsa.py: client-side RFC 9474 RSABSSA-SHA384-PSS-Deterministic with a throw-away key; public data only. "
                       "backend/internal/fdcrypto/python_vector_test.go verifies it with the real server verifier.",
               "public_key_jwk": {"kty": "RSA", "n": b64u(n), "e": b64u(e)}, "token_msg": base64.b64encode(msg).decode(), "sig": base64.b64encode(sig).decode()},
              open(path, "w"), indent=1)


# ---------------------------------------------------------------- clock estimate (timesync.py)

def fake_server(offset: float, rtt: float, gap: float, start: float, count: int):
    """Polls at local times start, start+gap+rtt ...; the server answers in the middle of each round trip with floor(its clock)."""
    out, t = [], start
    for _ in range(count):
        t0, t1 = t, t + rtt
        out.append((t0, t1, int((t0 + rtt / 2) + offset)))
        t = t1 + gap
    return out


@pytest.mark.parametrize("offset", [0.0, 3.37, -2.81, 7200.5])
def test_clock_offset_estimate(offset):
    s = fake_server(offset, rtt=0.004, gap=0.01, start=1_000_000.123, count=200)
    est = timesync.offset_from_samples(s)
    assert est is not None
    off, unc = est
    assert abs(off - offset) <= unc + 1e-9 and unc < 0.02            # the true offset lies inside the stated uncertainty


def test_clock_offset_needs_a_clean_tick():
    assert timesync.offset_from_samples([(0, 0.01, 5), (0.02, 0.03, 5)]) is None          # no tick seen
    assert timesync.offset_from_samples([(0, 0.01, 5), (2.0, 2.01, 7)]) is None            # polled too slowly: ambiguous
    assert timesync.parse_http_date("Sun, 06 Nov 1994 08:49:37 GMT") == 784111777 and timesync.parse_http_date("nonsense") is None

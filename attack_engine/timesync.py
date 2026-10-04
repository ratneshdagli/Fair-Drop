"""Estimate a server's clock from its HTTP `Date` header (1-second resolution), the way an outsider with no special access
can: poll a cheap URL fast, find the poll where the header's second ticks over, and the boundary happened between the
previous poll and that one. Accuracy is about one poll interval + one round trip (tens of milliseconds locally).
Pure functions; the caller supplies the fetch and the sleep, so it works with requests, Locust or a test double."""
from __future__ import annotations
import time
from email.utils import parsedate_to_datetime
from typing import Callable, List, Optional, Tuple

Sample = Tuple[float, float, int]      # (local time before sending, local time after receiving, server Date as whole epoch seconds)


def parse_http_date(s: Optional[str]) -> Optional[int]:
    try:
        return int(parsedate_to_datetime(s).timestamp()) if s else None
    except (TypeError, ValueError):
        return None


def offset_from_samples(samples: List[Sample]) -> Optional[Tuple[float, float]]:
    """Returns (offset_s, uncertainty_s) with  server_time = local_time + offset,  or None if no clean tick was seen."""
    for prev, cur in zip(samples, samples[1:]):
        if cur[2] - prev[2] == 1:                       # exactly one second ticked between two polls: boundary is bracketed
            lo, hi = prev[0], cur[1]                    # it happened after prev was sent and before cur was answered
            return cur[2] - (lo + hi) / 2, (hi - lo) / 2
    return None


def estimate_offset(fetch_date: Callable[[], Optional[int]], sleep: Callable[[float], None] = time.sleep,
                    gap: float = 0.01, max_s: float = 2.6) -> Optional[Tuple[float, float]]:
    """Poll `fetch_date()` (server Date header as epoch seconds) until a second ticks over (at most ~1 s), then estimate."""
    out: List[Sample] = []
    end = time.time() + max_s
    while time.time() < end:
        t0 = time.time()
        d = fetch_date()
        t1 = time.time()
        if d is not None:
            out.append((t0, t1, d))
            if len(out) > 1 and out[-1][2] - out[-2][2] == 1:
                break
        sleep(gap)
    return offset_from_samples(out)

"""Operator model: one operator owns N verified identities and a pool of simulated IP addresses.
The invariant under test: IPs are free, identities are not."""
from dataclasses import dataclass
from typing import List


@dataclass
class Operator:
    index: int
    id: str
    profile: str
    identities: List[str]
    ip_pool: int
    params: dict
    start: str = "open"

    def ip(self, k: int) -> str:
        """k-th address of this operator's pool (up to 64k addresses, unique per operator)."""
        k %= max(1, self.ip_pool)
        return f"10.{self.index % 250}.{(k // 250) % 256}.{k % 250 + 1}"

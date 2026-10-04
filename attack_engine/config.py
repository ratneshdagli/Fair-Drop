"""Configuration + scenario data model for the Fair Drop attack engine."""
from __future__ import annotations
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

BASE_URL = os.environ.get("FD_BASE_URL", "http://localhost:8088/api")   # nginx entry point + /api prefix
TEST_KEY = os.environ.get("FD_TEST_KEY", "test-key-demo")
TEST_PASSWORD = os.environ.get("FD_TEST_PASSWORD", "test-pass")
IDENTITY_COST_USD = float(os.environ.get("FD_IDENTITY_COST_USD", "3.0"))   # ASSUMED price of one verified identity (SIM)
REPORTS_DIR = os.environ.get("FD_REPORTS_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports"))
KILL_URLS = [u for u in os.environ.get("FD_KILL_URLS", "http://localhost:8082").split(",") if u]  # direct replica URLs for /test/die
POPULATION = 50_000                                                      # seeded synthetic verified identities

DEFAULT_TIERS = [
    {"id": "gold", "name": "Gold", "price_cents": 25000, "seats": 100},
    {"id": "silver", "name": "Silver", "price_cents": 15000, "seats": 150},
    {"id": "general", "name": "General", "price_cents": 8000, "seats": 250},
]
HUMAN_TIER_WEIGHTS = {"gold": 0.2, "silver": 0.3, "general": 0.5}        # humans spread out...
BOT_TIER = "gold"                                                         # ...bots go straight for the most resaleable tier


@dataclass
class OperatorSpec:
    """One attacker operator: owns `identities` verified accounts and a pool of simulated IPs."""
    id: str
    profile: str                 # key of profiles.PROFILES
    identities: int
    ip_pool: int = 1000
    params: Dict[str, float] = field(default_factory=dict)   # profile knobs, e.g. {"requests": 300}
    start: str = "open"          # open = fire at window open; uniform = spread over the window; boundary = STATE_SNIPER (wakes before time zero, aims at the open/close instants)


@dataclass
class Scenario:
    name: str
    description: str = ""
    policy: str = "fairdrop"     # policy under test: fairdrop | fcfs  (counterfactuals are always computed for all three)
    humans: int = 1000
    operators: List[OperatorSpec] = field(default_factory=list)
    tiers: List[dict] = field(default_factory=lambda: [dict(t) for t in DEFAULT_TIERS])
    window_sec: float = 60.0     # span over which humans arrive
    arrival: str = "rush"        # rush | uniform | poisson
    concurrency: int = 2000      # locust virtual users (concurrent actors in flight)
    processes: int = 4           # locust worker processes
    seed: int = 7
    identity_cost_usd: float = IDENTITY_COST_USD
    kill_replica_at_s: Optional[float] = None
    malicious: bool = False
    claims: bool = False
    claim_sec: int = 20
    human_claim_rate: float = 0.9   # humans who actually claim; the rest forfeit and cascade
    tag: str = ""                # sub-run label (e.g. identities=1000)
    human_ids: Optional[List[str]] = None

    def total_actors(self) -> int:
        return self.humans + sum(o.identities for o in self.operators)

    def to_dict(self):
        d = asdict(self); d.pop("human_ids", None); return d

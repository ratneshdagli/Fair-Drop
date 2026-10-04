"""Identity pool: the synthetic verified users seeded by POST /test/seed (t_000001 ...)."""
import random
from typing import Dict, List, Tuple


def user_id(i: int) -> str:
    return f"t_{i:06d}"


def human_ip(i: int) -> str:
    """Every human has their own residential-looking IP."""
    return f"100.{(i >> 16) & 255}.{(i >> 8) & 255}.{i & 255}"


def assign_identities(population: int, operator_sizes: List[int], humans: int, seed: int) -> Tuple[List[List[str]], List[str]]:
    """Shuffle the pool (so bots do not systematically hold low ids) and carve out per-operator identity sets
    and the human set. Raises if the scenario needs more identities than were seeded."""
    need = sum(operator_sizes) + humans
    if need > population:
        raise ValueError(f"scenario needs {need} identities but only {population} were seeded")
    ids = [user_id(i) for i in range(1, population + 1)]
    random.Random(seed).shuffle(ids)
    out, pos = [], 0
    for n in operator_sizes:
        out.append(ids[pos:pos + n]); pos += n
    return out, ids[pos:pos + humans]

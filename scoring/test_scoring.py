"""python -m pytest scoring  (or: python scoring/test_scoring.py)"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from scoring.metrics import policy_metrics, score_counterfactuals, expected_policy_metrics, human_chance, percentile

def labels():
    L = {f"h{i}": ("human", "") for i in range(90)}
    L.update({f"b{i}": ("bot", "opA") for i in range(10)})
    return L

def test_bot_advantage_ratio():
    L = labels(); parts = {a: 1 for a in L}
    # fair: 10 seats spread proportional -> ratio 1
    fair = policy_metrics({"g": [f"h{i}" for i in range(9)] + ["b0"]}, parts, L)
    assert abs(fair["bot_advantage_ratio"] - 1.0) < 1e-9 and fair["human_win_rate"] == 9 / 90
    # bots took everything -> ratio 10
    fc = policy_metrics({"g": [f"b{i}" for i in range(10)]}, parts, L)
    assert abs(fc["bot_advantage_ratio"] - 10.0) < 1e-9
    assert fc["operators"]["opA"]["cost_per_seat_usd"] == 10 * 3.0 / 10

def test_naive_vs_fairdrop_monte_carlo():
    L = labels()
    tiers = [{"id": "g", "seats": 10}]
    # bots send 100 requests each, humans 1: naive lottery should hand bots ~ most seats, fair drop (cap 1, one entry each) ~10%
    attempts = {a: (100 if a.startswith("b") else 1) for a in L}
    entries = {a: 1 for a in L}
    parts = attempts
    n = expected_policy_metrics({"g": attempts}, tiers, 4, parts, L, k=200)
    f = expected_policy_metrics({"g": entries}, tiers, 1, parts, L, k=200)
    assert n["bot_seat_share"] > 0.8, n["bot_seat_share"]
    assert abs(f["bot_advantage_ratio"] - 1.0) < 0.25, f["bot_advantage_ratio"]
    assert abs(sum(f["win_probability"].values()) - 10) < 1e-6

def test_percentile():
    assert percentile(list(range(1, 101)), 99) == 100 and percentile([], 50) == 0.0

if __name__ == "__main__":
    test_bot_advantage_ratio(); test_naive_vs_fairdrop_monte_carlo(); test_percentile(); print("scoring tests ok")

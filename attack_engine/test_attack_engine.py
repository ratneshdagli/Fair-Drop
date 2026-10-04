"""Plan/profile/label tests (no network). Run: python -m pytest attack_engine/test_attack_engine.py"""
import pytest
from attack_engine import config
from attack_engine.profiles import PROFILES
from attack_engine.scenarios import EXPERIMENTS, build_plan, labels_from_plan
from attack_engine.users import assign_identities, human_ip


def plan(exp="exp2", scale=0.1, i=0, drop="d"):
    return build_plan(EXPERIMENTS[exp](scale)[i], config.POPULATION, drop)


def test_all_profiles_have_both_flows():
    assert set(PROFILES) == {"HUMAN", "SPEED_BOT", "FLOOD_BOT", "RETRY_BOT", "PROXY_ROTATOR", "SYBIL_OPERATOR", "API_SCRAPER", "UI_MIMIC",
                             "CRYPTO_SWARM", "SMART_SCRAPER", "STATE_SNIPER", "CLAIM_SNIPER"}
    assert all(callable(p.fd) and callable(p.fcfs) for p in PROFILES.values())


def test_plan_is_reproducible_and_identities_are_unique():
    a, b = plan(), plan()
    assert a == b                                              # same seed => same plan
    uids = [x["uid"] for x in a["actors"]]
    assert len(uids) == len(set(uids))                         # one actor per identity, none shared between operators/humans


def test_operator_to_identity_and_ip_mapping():
    p = plan()
    ops = {o["id"]: o for o in p["operators"]}
    assert len(ops) == 20 and all(o["ip_pool"] == 2000 for o in ops.values())
    assert all(sum(1 for a in p["actors"] if a["op"] == i) == 10 for i in ops)   # 10 identities per operator
    humans = [a for a in p["actors"] if a["kind"] == "human"]
    assert len({a["ip"] for a in humans}) == len(humans)       # each human has their own IP
    assert human_ip(1) != human_ip(2)


def test_labels_match_plan():
    p = plan()
    L = labels_from_plan(p)
    assert len(L) == len(p["actors"])
    assert all((l["kind"] == "bot") == bool(l["operator_id"]) for l in L)


def test_sybil_scaling_has_three_sizes_and_exp4_has_one_human():
    sizes = sorted(sum(o.identities for o in s.operators) for s in EXPERIMENTS["exp3"](1.0))
    assert len(sizes) == 3 and sizes[0] < sizes[1] < sizes[2]
    assert sum(1 for a in plan("exp4", 1.0)["actors"] if a["kind"] == "human") == 1


def test_pool_overflow_is_rejected():
    with pytest.raises(ValueError):
        assign_identities(10, [8], 5, 1)


def test_custom_mix_uses_exactly_the_chosen_bots():
    from attack_engine import scenarios
    scenarios.CUSTOM["spec"] = {"people": 300, "bots": {"SPEED_BOT": 20, "API_SCRAPER": 10, "HUMAN": 5, "NOPE": 3, "FLOOD_BOT": 0}}
    s = scenarios.ALL_RUNNABLE["custom"](1)[0]
    assert {o.profile: o.identities for o in s.operators} == {"SPEED_BOT": 20, "API_SCRAPER": 10}
    assert s.humans == 300 and s.total_actors() == 330
    scenarios.CUSTOM["spec"] = {"people": 60000, "bots": {}}
    try:
        scenarios.ALL_RUNNABLE["custom"](1)
        assert False, "more than 50,000 accounts must be refused"
    except SystemExit:
        pass

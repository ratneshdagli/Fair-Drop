"""Evaluation-only labels (user -> bot/human, operator). Uploaded to POST /test/labels; the server never reads them
during allocation (they only feed the admin monitor split and the scorer)."""
import json
import os
from typing import Dict, Tuple


def upload(api, labels: list, replace: bool = True):
    for i in range(0, len(labels), 20000):
        api.req("POST", "/test/labels", json={"labels": labels[i:i + 20000], "replace": replace and i == 0})


def write_file(labels: list, path: str):
    with open(path, "w") as f:
        json.dump(labels, f)


def as_map(labels: list) -> Dict[str, Tuple[str, str]]:
    return {l["user_id"]: (l["kind"], l["operator_id"]) for l in labels}


def from_file(path: str):
    return json.load(open(path))

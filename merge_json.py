#!/usr/bin/env python3

from collections import OrderedDict
import json
import sys

def merge(lhs, rhs):
    for key, value in rhs.items():
        if key in lhs and isinstance(lhs[key], dict) and isinstance(value, dict):
            merge(lhs[key], value)
        elif key in lhs and isinstance(lhs[key], list) and isinstance(value, list):
            lhs[key].extend(value)
        else:
            lhs[key] = value
    return lhs

if __name__ == "__main__":
    merged = OrderedDict()
    for fn in sys.argv[1:]:
        with open(fn) as f:
            merged = merge(merged, json.load(f, object_pairs_hook=OrderedDict))
    json.dump(merged, sys.stdout, indent=4)


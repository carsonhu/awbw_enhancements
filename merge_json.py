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
    output_file = None
    
    for fn in sys.argv[1:]:
        if fn.startswith("--out="):
            output_file = fn.split("=", 1)[1]
            continue
            
        with open(fn) as f:
            merged = merge(merged, json.load(f, object_pairs_hook=OrderedDict))
            
    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(merged, f, indent=4)
    else:
        json.dump(merged, sys.stdout, indent=4)


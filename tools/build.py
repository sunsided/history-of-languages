#!/usr/bin/env python3
"""Validate the dataset and emit dist/graph.json.

Usage:  python3 tools/build.py            # validate + build
        python3 tools/build.py --missing  # list referenced-but-undefined ids, grouped

Checks: JSON Schema per record, unique ids, every referenced node/concept/cluster/source/claim exists,
no relation points forward in time by more than a tolerance (likely reversed edge), cluster parents exist.
Derives inverse edges (influenced, superseded_by, has_dialect, ...) and each node's era.
"""
import json, sys, pathlib, collections
import yaml
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEMA = json.loads((ROOT / "schema" / "dataset.schema.json").read_text())

INVERSE = {
    "influenced_by": "influenced",
    "successor_of": "superseded_by",
    "dialect_of": "has_dialect",
    "superset_of": "has_superset",
    "subset_of": "has_subset",
    "fork_of": "forked_as",
    "targets": "targeted_by",
    "implemented_in": "used_to_implement",
}
FORWARD_TOLERANCE = 3  # years: an influence may come from a contemporary still in development


def validator(defname):
    sub = {"$schema": SCHEMA["$schema"], "$defs": SCHEMA["$defs"], "$ref": f"#/$defs/{defname}"}
    return Draft202012Validator(sub)


def load_list(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def main():
    errors, warnings = [], []
    missing = collections.defaultdict(set)

    def check(defname, items, where):
        v = validator(defname)
        for it in items:
            for e in v.iter_errors(it):
                errors.append(f"{where}: {it.get('id', '?')}: {'/'.join(map(str, e.path))}: {e.message}")

    nodes = []
    for p in sorted((DATA / "nodes").glob("*.yaml")):
        items = load_list(p)
        check("node", items, p.name)
        for it in items:
            it["_file"] = p.name
        nodes += items

    def load(name, defname):
        p = DATA / name
        items = load_list(p) if p.exists() else []
        check(defname, items, name)
        return items

    concepts = load("concepts.yaml", "concept")
    clusters = load("clusters.yaml", "cluster")
    eras = load("eras.yaml", "era")
    sources = load("sources.yaml", "source")
    claims = load("claims.yaml", "claim")
    lineages = []
    for p in sorted((DATA / "lineages").glob("*.yaml")):
        items = load_list(p)
        check("lineage", items, p.name)
        lineages += items

    def index(items, kind):
        out = {}
        for it in items:
            if it["id"] in out:
                errors.append(f"duplicate {kind} id: {it['id']}")
            out[it["id"]] = it
        return out

    N, C, K, S, CL = (index(nodes, "node"), index(concepts, "concept"), index(clusters, "cluster"),
                      index(sources, "source"), index(claims, "claim"))

    def need(kind, table, ident, where):
        if ident not in table:
            missing[kind].add(ident)
            errors.append(f"{where}: unknown {kind} '{ident}'")

    for n in nodes:
        w = f"node {n['id']}"
        need("cluster", K, n["cluster"], w)
        for facet, vals in (n.get("tags") or {}).items():
            for c in vals:
                need("concept", C, c, f"{w} tags.{facet}")
        for s in n.get("sources", []):
            need("source", S, s, w)
        for m in n.get("milestones", []):
            for c in m.get("introduces", []):
                need("concept", C, c, f"{w} milestone {m['version']}")
            for s in m.get("sources", []):
                need("source", S, s, w)
        y = n["origin"]["first_appeared"]["year"]
        for r in n.get("relations", []):
            need("node", N, r["to"], w)
            for c in r.get("aspects", []):
                need("concept", C, c, f"{w} -> {r['to']}")
            for s in r.get("sources", []):
                need("source", S, s, w)
            t = N.get(r["to"])
            if t and r["type"] not in ("targets", "implemented_in"):
                ty = t["origin"].get("began", t["origin"]["first_appeared"])["year"]
                if ty > r.get("year", y) + FORWARD_TOLERANCE:
                    warnings.append(f"{w} ({y}) {r['type']} {r['to']} ({ty}): points forward in time")
    for c in concepts:
        for b in c.get("broader", []):
            need("concept", C, b, f"concept {c['id']}")
        fs = c.get("first_seen") or {}
        if "node" in fs:
            need("node", N, fs["node"], f"concept {c['id']} first_seen")
        for s in c.get("sources", []):
            need("source", S, s, f"concept {c['id']}")
    for k in clusters:
        if "parent" in k:
            need("cluster", K, k["parent"], f"cluster {k['id']}")
        for s in k.get("key_sources", []):
            need("source", S, s, f"cluster {k['id']}")
    for e in eras:
        for c in e.get("defining_concepts", []):
            need("concept", C, c, f"era {e['id']}")
    for l in lineages:
        for c in l.get("concepts", []):
            need("concept", C, c, f"lineage {l['id']}")
        for c in l.get("claims", []):
            need("claim", CL, c, f"lineage {l['id']}")
        for st in l["steps"]:
            w = f"lineage {l['id']} step {st['year']} '{st['title']}'"
            for x in st.get("nodes", []):
                need("node", N, x, w)
            for x in st.get("concepts", []):
                need("concept", C, x, w)
            for x in st.get("sources", []):
                need("source", S, x, w)
    for cl in claims:
        for ev in cl.get("evidence", []):
            need("source", S, ev["source"], f"claim {cl['id']}")
        for x in cl.get("nodes", []):
            need("node", N, x, f"claim {cl['id']}")

    # Every cluster referenced by an id prefix must exist too (a/b requires a).
    for k in list(K):
        parts = k.split("/")
        for i in range(1, len(parts)):
            pre = "/".join(parts[:i])
            if pre not in K:
                missing["cluster"].add(pre)
                errors.append(f"cluster {k}: missing ancestor cluster '{pre}'")

    if "--missing" in sys.argv:
        for kind, ids in sorted(missing.items()):
            print(f"## {kind} ({len(ids)})")
            for i in sorted(ids):
                print(" ", i)
        return 1 if missing else 0

    for w in warnings:
        print("WARN ", w)
    if errors:
        for e in errors[:200]:
            print("ERROR", e)
        print(f"\n{len(errors)} errors, {len(warnings)} warnings")
        return 1

    # ---- derive and emit ----
    def era_of(year):
        cands = [e for e in eras if e["start"] <= year <= e.get("end", 9999)]
        cands.sort(key=lambda e: e["start"], reverse=True)  # most specific (latest start) wins
        return cands[0]["id"] if cands else None

    edges = []
    for n in nodes:
        n.pop("_file", None)
        n.setdefault("era", era_of(n["origin"]["first_appeared"]["year"]))
        for r in n.get("relations", []):
            edges.append({"from": n["id"], **r, "inverse": INVERSE[r["type"]]})

    inbound = collections.defaultdict(list)
    for e in edges:
        inbound[e["to"]].append({"type": e["inverse"], "to": e["from"]})
    for n in nodes:
        n["derived"] = sorted(inbound.get(n["id"], []), key=lambda r: (r["type"], r["to"]))

    out = {
        "generated_from": "data/",
        "counts": {"nodes": len(nodes), "edges": len(edges), "concepts": len(concepts), "clusters": len(clusters),
                   "sources": len(sources), "lineages": len(lineages), "claims": len(claims)},
        "eras": eras, "clusters": clusters, "concepts": concepts, "nodes": nodes, "edges": edges,
        "lineages": lineages, "claims": claims, "sources": sources,
    }
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist" / "graph.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out["counts"]))
    print(f"{len(warnings)} warnings")
    return 0


if __name__ == "__main__":
    sys.exit(main())

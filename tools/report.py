#!/usr/bin/env python3
"""Research to-do report: where the dataset is thin. Read-only; run tools/build.py for validation.

Usage:  python3 tools/report.py              # everything
        python3 tools/report.py clusters     # one section: clusters, orphans, edges, concepts, sources,
                                             #   decades, people, find
        python3 tools/report.py find <text>  # is a language (or alias, or backlog item) already here?
"""
import collections, pathlib, sys
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def load(p):
    with open(p, encoding="utf-8") as f:
        return yaml.safe_load(f) or []


nodes = [n for p in sorted((DATA / "nodes").glob("*.yaml")) for n in load(p)]
N = {n["id"]: n for n in nodes}
clusters = load(DATA / "clusters.yaml")
concepts = load(DATA / "concepts.yaml")
sources = load(DATA / "sources.yaml")
subjects = load(DATA / "media-subjects.yaml") if (DATA / "media-subjects.yaml").exists() else []
edges = [(n["id"], r) for n in nodes for r in n.get("relations", [])]
year = lambda n: n["origin"]["first_appeared"]["year"]


def section(title):
    print(f"\n## {title}")


def clusters_report():
    section("Clusters by research status (backlog = nodes still to add)")
    members = collections.Counter(n["cluster"] for n in nodes)
    for c in sorted(clusters, key=lambda c: ({"stub": 0, "draft": 1, "reviewed": 2}[c["research_status"]], c["id"])):
        print(f"  {c['research_status']:8} {c['id']:32} nodes={members[c['id']]:<3} backlog={len(c.get('backlog', [])):<3}"
              f" questions={len(c.get('research_questions', []))}")


def orphans_report():
    section("Nodes with no stored or derived relation (orphans)")
    linked = {a for a, _ in edges} | {r["to"] for _, r in edges}
    for n in nodes:
        if n["id"] not in linked:
            print(f"  {n['id']} ({year(n)}, {n['cluster']})")
    section("Language nodes with no ancestor (nothing stored on them)")
    has_out = {a for a, _ in edges}
    for n in nodes:
        if n["kind"] == "language" and n["id"] not in has_out:
            print(f"  {n['id']} ({year(n)})")


def edges_report():
    section("Edges to confirm or delete (confidence: low)")
    for a, r in edges:
        if r.get("confidence") == "low":
            print(f"  {a} {r['type']} {r['to']}" + (f"  # {r['note']}" if r.get("note") else ""))
    section("Strong influence edges without aspects or sources")
    for a, r in edges:
        if r["type"] == "influenced_by" and r.get("weight") == "strong" and not (r.get("aspects") or r.get("sources")):
            print(f"  {a} -> {r['to']}")


def concepts_report():
    used = collections.Counter()
    for n in nodes:
        for vals in (n.get("tags") or {}).values():
            used.update(vals)
        for m in n.get("milestones", []):
            used.update(m.get("introduces", []))
    for _, r in edges:
        used.update(r.get("aspects", []))
    section("Concepts without a summary")
    print("  " + ", ".join(c["id"] for c in concepts if not c.get("summary")))
    section("Concepts without first_seen (who did it first?)")
    print("  " + ", ".join(c["id"] for c in concepts if not c.get("first_seen")))
    section("Concepts never used")
    print("  " + ", ".join(c["id"] for c in concepts if not used[c["id"]]))
    section("first_seen later than a node that had it earlier (first_seen or a milestone may be wrong)")

    def got_it(n, cid):
        """Year node n got concept cid: the milestone that introduces it, else first appearance; None if untagged."""
        ms = [m["year"] for m in n.get("milestones", []) if cid in m.get("introduces", [])]
        if ms:
            return min(ms)
        return year(n) if any(cid in v for v in (n.get("tags") or {}).values()) else None

    for c in concepts:
        fs = (c.get("first_seen") or {}).get("year")
        if fs is None:
            continue
        earlier = sorted((y, n["id"]) for n in nodes if (y := got_it(n, c["id"])) is not None and y < fs)
        if earlier:
            print(f"  {c['id']} first_seen {fs}; tagged earlier: {', '.join(f'{i} ({y})' for y, i in earlier[:4])}")


def sources_report():
    section("Sources")
    checked = [s for s in sources if s.get("checked")]
    primary = [s for s in sources if s.get("primary")]
    print(f"  {len(sources)} sources, {len(primary)} primary, {len(checked)} checked (re-read)")
    cited = collections.Counter()
    for n in nodes:
        cited.update(n.get("sources", []))
        cited.update((n.get("example") or {}).get("sources", []))
    for _, r in edges:
        cited.update(r.get("sources", []))
    unchecked = {s["id"] for s in sources if not s.get("checked")}
    top = [f"{s} ({k})" for s, k in cited.most_common() if s in unchecked][:12]
    print("  most-cited unchecked (re-read these first): " + ", ".join(top))
    section("Nodes by research status")
    print("  " + ", ".join(f"{k}={v}" for k, v in collections.Counter(n["research_status"] for n in nodes).items()))


def decades_report():
    section("Nodes per decade (thin decades are where to look next)")
    d = collections.Counter((year(n) // 10) * 10 for n in nodes if year(n) >= 1930)
    for k in sorted(d):
        print(f"  {k}s {'#' * d[k]} {d[k]}")


def people_report():
    section("Creators without a media subject (no photo will be looked up)")
    have = {s.get("person") for s in subjects}
    names = sorted({c["name"] for n in nodes for c in n.get("creators", [])} - have)
    print("  " + ", ".join(names))


def find(text):
    t = text.lower()
    hits = [f"node {n['id']} ({n['name']}, {year(n)}, {n['cluster']})" for n in nodes
            if t in n["id"].lower() or t in n["name"].lower() or any(t in a.lower() for a in n.get("aliases", []))]
    hits += [f"backlog of {c['id']}: {b['name']}" for c in clusters for b in c.get("backlog", []) if t in b["name"].lower()]
    hits += [f"concept {c['id']}" for c in concepts if t in c["id"] or t in c["name"].lower()]
    print("\n".join(hits) or f"'{text}' is not in the dataset (nodes, aliases, backlogs, concepts)")


SECTIONS = {"clusters": clusters_report, "orphans": orphans_report, "edges": edges_report,
            "concepts": concepts_report, "sources": sources_report, "decades": decades_report,
            "people": people_report}

if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["find"]:
        find(" ".join(args[1:]))
    else:
        for name in args or SECTIONS:
            SECTIONS[name]()

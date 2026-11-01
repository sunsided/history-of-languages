---
name: find-missing-languages
description: Explore for programming languages, machines, assemblers and esoterics the ancestry dataset does not cover yet, decide which belong, and record them as cluster backlog items or new clusters. Use when asked what is missing, to expand coverage, to unfold a cluster, or to survey an era or family.
---

# Find what is missing, and decide what belongs

Exploration produces a triaged list, not finished nodes. Nodes are written afterwards with the
`research-language` skill. Keep the two apart: a survey that tries to write 40 nodes at once ends up with
40 thin, unsourced ones.

## 1. See where the dataset is thin

```
git pull
python3 tools/report.py clusters decades orphans
```

- Clusters at `stub` with long backlogs, and decades with few nodes, are the first places to look.
- Orphans (nodes with no edges) usually mean a missing ancestor or descendant.
- Read the cluster's `backlog` and `research_questions` before searching: someone already started.

## 2. Survey sources

Pick sources that enumerate languages, then cross-check:

- **HOPL** I–IV tables of contents: every language with a HOPL paper belongs.
- **Wikipedia:** "Timeline of programming languages", "Generational list of programming languages",
  "List of programming languages by type", and each family article (ALGOL, ML, Lisp, BASIC, Pascal
  dialects).
- **HOPL.info** (Bill Kinnersley's online encyclopedia of about 9,000 languages) for obscure dates and
  first references.
- **Éric Lévénez's computer languages timeline** and the O'Reilly history poster for family lines.
- **Sammet (1969)** for the 1950s–60s; **Knuth and Trabb Pardo (1976)** for everything before 1957.
- **Machines and assemblers:** bitsavers.org manuals, Wikipedia's lists of instruction set architectures
  and of early computers.
- **Esoterics:** esolangs.org (its "Language list" and "Turing tarpit" category).
- **Recent languages:** GitHub's Octoverse, the Stack Overflow survey, RedMonk and TIOBE rankings, the
  Rosetta Code language list.

For every candidate run `python3 tools/report.py find "<name>"` before writing anything down.

## 3. The inclusion test

A candidate belongs if at least one is true. Note which one in the backlog `hint`:

1. **First or defining:** it introduced, or was the first to popularize, a concept that matters (it would
   be `first_seen` for a concept, or a step in a lineage).
2. **A missing link:** a documented ancestor or descendant of a node already here, without which an edge
   would be wrong or unexplained.
3. **Widely used** in its time (a major ranking, a large installed base, or a standard).
4. **A family member** that a reader would expect to find in an unfolded cluster (Modula-3 in the Wirth
   line, the main BASIC dialects).
5. **Esoterics:** only if it demonstrates a computational idea (a Turing tarpit, two-dimensional control
   flow, self-modification, natural-language syntax) or is a well-known cultural reference.

Not a node: a version (make it a milestone), an implementation or compiler (unless it defines the
language), a library or framework, a configuration or markup format with no computation (JSON, YAML),
and toy or one-off languages that fail all five tests.

## 4. Record the result

- Candidates for an existing cluster: add `{ name, year, hint }` to that cluster's `backlog` in
  `data/clusters.yaml`. The `hint` says why it belongs and the best source lead.
- A family with no cluster yet: add a cluster (`id` path under its parent, `name`, `summary`,
  `research_status: stub`, `backlog`, `research_questions`, `key_sources`). Every prefix of the id must
  exist as a cluster.
- Open questions ("Was X derived from Y or parallel?") go into `research_questions`.
- Sources found during the survey go into `data/sources.yaml` and the cluster's `key_sources`.

Run `python3 tools/build.py`, commit ("Survey <family/era>: N backlog items"), push.

## 5. Unfolding a cluster

When asked to unfold a cluster: take its backlog in year order, write each as a node with the
`research-language` skill, connect them with the `map-relations` skill, delete each backlog line as its
node lands, answer or carry over the `research_questions`, then raise the cluster's `research_status`
(`draft` once its core members are in with sources; `reviewed` only when every member was checked
against primary sources).

## Report back

Tell Markus how many candidates you found, which you recorded where, which you rejected and why (one
line each for the notable rejections), and which cluster to unfold next.

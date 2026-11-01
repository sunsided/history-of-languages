---
name: research-language
description: Add a language, machine, assembler, notation or esoteric language to the ancestry dataset, or deepen an existing node (dating, creators, milestones, example, sources), with primary-source research. Use when asked to add, research, fill in, fix or review a node in data/nodes/.
---

# Research and add (or deepen) a node

The goal is a node that renders in the viewer, passes `tools/build.py`, and says no more than its sources
support. Read `docs/authoring.md` for the full format; this skill is the procedure.

## 1. Check it is not already here

```
git pull
python3 tools/report.py find "<name>"      # also try aliases and spellings: "Modula 2", "Turbo Pascal"
```

- Already a node: you are deepening it. Read the node and its cluster first.
- In a cluster `backlog`: that cluster is where it goes. Remove the backlog line when the node exists.
- We map **every language variant**. A version of a language (Python 3, Fortran 90, C++11) is a
  **milestone** on its node. A named dialect, including one defined by a particular compiler or product
  (MACLISP, Turbo Pascal, Borland Pascal, QuickBASIC, GNU C, C++/CLI), is a **node** with `dialect_of`,
  `superset_of` or `successor_of`. A re-implementation on another platform (Jython, JRuby, IronPython) is a
  node with `dialect_of` plus `implemented_in`.
- A compiler or port that accepts the language unchanged (DJGPP is GCC for DOS) is not a node of its own:
  mention it in the dialect's `notes` or as a milestone. If it added its own extensions, it is a dialect.
- Unsure whether it belongs at all: use the inclusion test in the `find-missing-languages` skill.

## 2. Find sources, best first

1. The designers' own history: HOPL I (1978), II (1993), III (2007) and IV (2020) papers. Check HOPL first;
   most major languages have one.
2. The defining document: language report, manual, standard, first paper, or release announcement.
3. Period documents: manuals and listings on bitsavers.org, softwarepreservation.org (Lisp, ALGOL,
   FORTRAN, Smalltalk, C), archive.org, the Computer History Museum.
4. Designer interviews and talks (oral histories at CHM, Masterminds of Programming).
5. Secondary: Sammet's *Programming Languages: History and Fundamentals* (1969), Knuth and Trabb Pardo's
   *The Early Development of Programming Languages* (1976), Wikipedia (for leads and citations; follow
   its references rather than citing it when a primary source is reachable), esolangs.org for esoterics.

Read pages with the web-fetch tool (wikipedia.org is not reachable directly from the cloud sandbox). Add
each source to `data/sources.yaml` with a stable id (`author-year-short-title`, `wiki-<slug>`,
`esolangs-<slug>`), `primary: true` if written by the creators or at the time, and `checked: <today>`
only for sources you actually read for this work.

## 3. Write the node

Copy the annotated template in `docs/authoring.md`. Fill in this order, each from a source:

- **Dating:** `first_appeared` is the first public appearance (paper, report, release, or first working
  implementation, whichever came first; say which in `note`). Use `began` for a long design phase.
  Choose `precision` honestly; `disputed` with a `note` when sources disagree.
- **Place:** institution, city, country code.
- **Creators:** one person per entry, named as their English Wikipedia article title, with `role`. Check
  the spelling already used for that person in other nodes (`grep -n "name: <Surname>" data/nodes/`).
- **Cluster:** an existing cluster where possible. A new sub-cluster needs its own entry in
  `data/clusters.yaml` with `parent`, `summary`, `research_status: stub` and whatever backlog you noticed.
- **Tags:** concept ids only. Check each exists (`python3 tools/report.py find <word>`); add a concept to
  `data/concepts.yaml` only if no existing one fits, with `facet`, `broader`, a one-line `summary`.
- **Milestones:** versions that changed what the language is, with `introduces` for concepts that arrived
  then. If an introduced concept is older than its `first_seen` in `concepts.yaml`, update `first_seen`.
- **Relations:** follow the `map-relations` skill. At minimum the strong, documented ancestors.
- **Summary:** 2 to 5 plain sentences: what it is, what it took from whom, why it matters here.
- **Example:** real code from the defining document or a period source, period-accurate syntax, under
  about 25 lines, showing what is distinctive. Test it if a toolchain is available. Pseudocode only where
  nothing executable exists, with `note` starting "Illustrative" or "Reconstruction".
- **research_status:** `stub` if you only have name, date and cluster; `draft` for a filled node from
  good secondary sources; `reviewed` only if you re-read primary sources for every claim on it.
- **links:** Wikipedia URL and homepage if any.

Place the node in the file for its decade (machines and assembly in `01-machines-and-assembly.yaml`,
esoterics in `08-esoteric.yaml`), roughly in year order.

## 4. Photos

For each new creator with a Wikipedia article, and for a new machine, add an entry to
`data/media-subjects.yaml` (`person` must equal the creator name exactly). The download runs on Markus's
machine with `python3 tools/fetch_media.py`; mention that it needs re-running.

## 5. Validate and hand over

```
python3 tools/build.py          # 0 errors; read every warning
python3 tools/report.py concepts orphans   # no new contradictions or orphans from your change
```

Commit with a message that names the nodes and the main sources, push to `main`, and tell Markus what
is still unverified (low-confidence edges, reconstructed examples, sources not yet read).

## Deepening an existing node

Same steps, but start from what is there: re-read its sources, correct what they do not support, add
missing milestones and relations, replace an illustrative example with a sourced one when you find one,
and raise `research_status` only as far as the checking you did. Record what you could not settle in the
cluster's `research_questions`.

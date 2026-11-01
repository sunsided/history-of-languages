---
name: map-relations
description: Find, verify and record connections in the ancestry dataset - influenced_by, successor_of, dialect and fork edges with aspects, where concepts first appeared and when languages gained them, narrative lineages and fact-checked claims. Use when asked how languages are related, where a feature came from, to connect orphans, or to check a popular story.
---

# Map relations and connections

An edge is a historical claim. It needs the same evidence as any other claim, and its type, direction,
`aspects`, `weight` and `confidence` have to say exactly what the evidence supports.

## 1. Find candidate connections

```
git pull
python3 tools/report.py orphans edges concepts
```

Look for:
- orphans and language nodes with no ancestor;
- `confidence: low` edges to confirm or delete;
- strong edges without `aspects` or `sources`;
- concepts whose `first_seen` contradicts the data (some node had it earlier);
- concepts tagged on several nodes with no edge between them: either an influence is missing, or it is
  a genuine parallel invention, which is worth a `note`.

## 2. Evidence ladder

Rate what you found, best first. `confidence` follows from it:

| evidence | confidence |
|---|---|
| The designer says so in a primary source (HOPL paper, report, manual preface, interview) | `high` |
| Consistent statements in careful secondary sources (Sammet, Knuth and Trabb Pardo, histories citing primary material) | `medium` |
| Shared people, institution, time and design features, but nobody says so | `low`, with a `note` saying what would confirm it |
| Only resemblance | no edge; at most a note or a research question |

Beware of popular stories, timelines that copy each other, and influence charts without citations.
Designers also deny influences they had, or credit ones they read about later: quote what they said and
when.

## 3. Choose the type

- `influenced_by`: ideas travelled. List `aspects`: the concept ids that travelled (not everything the two
  share).
- `successor_of`: the same people or organisation meant it to replace the older one (Modula-2 → Oberon,
  BCPL → B → C). An outside language inspired by an older one is influence, not succession.
- `dialect_of`, `superset_of`, `subset_of`: the same language in a variant; code largely carries over.
- `fork_of`: the codebase or community split.
- `targets`: an assembler or language built for a specific machine.
- `implemented_in`: only when the bootstrapping story is worth showing.

## 4. Write the edge

```yaml
relations:
  - { type: influenced_by, to: simula, aspects: [classes, inheritance, virtual-dispatch, static-typing], weight: strong,
      confidence: high, sources: [stroustrup-1993-hopl2],
      note: "'C++ was designed to provide Simula's facilities for program organization together with C's efficiency and flexibility for systems programming.' (HOPL-II, §1)" }
```

- Store it on the **newer** node, pointing back. Never store `influenced` or `superseded_by`.
- If the influence arrived with a later version (JavaScript's async/await from C# in 2017), add `year`
  to the edge and the matching milestone on the newer node with `introduces`.
- `weight`: `strong` = a defining trait came from there; `moderate` = a clear but partial debt;
  `weak` = a detail.
- Quote or paraphrase the evidence in `note` when it is not obvious, and cite `sources`.
- If the older node does not exist yet, add it to the right cluster's backlog instead of an edge to
  nowhere.

## 5. Concepts: where an idea came from, and when languages got it

- `first_seen` in `data/concepts.yaml` = the earliest node in the dataset credited with the concept, with
  the year it arrived there. When you find an earlier one, update it and say why in `note`.
- A language that gained the concept later gets a milestone with `introduces`. This is how convergence
  shows: functional features arriving in Java and C#, OOP arriving in Fortran 2003.
- New concepts need `facet`, `broader` (place them under an existing, broader concept) and a one-line
  `summary`.

## 6. Lineages and claims

- A **lineage** (`data/lineages/*.yaml`) tells one idea's story in ordered `steps`, each with `year`,
  `title`, `text`, `nodes`, `concepts`, `systems` (operating systems, libraries, machines that are not
  nodes) and `sources`. Use one when a chain of edges alone does not explain the history (interrupts →
  cooperative multitasking → threads → async/await). Every step's nodes must exist.
- A **claim** (`data/claims.yaml`) checks a popular statement. Give a `verdict` (`confirmed`,
  `mostly-true`, `nuanced`, `mostly-false`, `false`, `unresolved`), a short `summary`, and `evidence`
  with `source`, `locator` (page or section) and a verbatim `quote`. Link it from the lineage it
  belongs to. `data/claims.yaml` → `cpp-oop-by-accident` is the model.

## 7. Validate

```
python3 tools/build.py      # 0 errors; a "points forward in time" warning means a reversed edge or a missing `year`
python3 tools/report.py edges concepts
```

Commit, push, and tell Markus which edges you added, changed or deleted, with the confidence of each
and the open questions you left in `research_questions`.

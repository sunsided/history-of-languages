# History of programming languages

A researched dataset of programming-language ancestry, from the Antikythera mechanism and Jacquard's
loom through machine code, assemblers and every notable language (including the esoterics that make a
point), plus the concepts that travelled between them. `viewer/` renders it as an interactive timeline;
a public site comes later. The data is the product: it has to be right, cited and honest about what is
not yet verified.

## Where and how to work

- Repo: `github.com/sunsided/history-of-languages` (private). Markus's checkout is
  `/home/markus/dev/mine/web/history-of-languages`; he runs the viewer from it with live reload on
  `data/*.yaml`.
- Work on `main`, no branches or PRs unless a change is risky. Pull before editing (Markus commits too),
  commit in small, topic-sized commits, push, and tell Markus to pull.
- `viewer/` is Markus's code. Do not change it unless asked; when a data change needs a viewer change,
  say so (see the table at the end of `docs/authoring.md`).

## Commands

```
python3 tools/build.py              # validate everything, emit dist/graph.json; must end with 0 errors
python3 tools/build.py --missing    # ids referenced but not defined
python3 tools/report.py             # research to-do: thin clusters, orphans, weak edges, concept dating
python3 tools/report.py find <x>    # is it already a node, alias, backlog item or concept?
python3 tools/fetch_media.py        # photos from Wikimedia Commons (needs network to Wikimedia)
task dev                            # viewer on :5173      task check   # type-check the viewer
```

Needs `pyyaml` and `jsonschema`.

## Rules that keep the data trustworthy

1. **Sources first.** Find the primary source (HOPL papers, language reports and manuals, the designers'
   own histories, period documents on bitsavers or softwarepreservation.org) before writing a claim.
   Every node, strong edge and example cites ids from `data/sources.yaml`.
2. **Never invent.** No guessed dates, creators, quotes, version numbers or influences. If something is
   plausible but unconfirmed, write it as `confidence: low` with a `note` saying what would confirm it, or
   put it in the cluster's `research_questions`.
3. **Status says how much was checked.** `stub` / `draft` / `reviewed` on nodes and clusters; `checked:
   <date>` on a source only after actually reading it against what cites it. Never raise to `reviewed`
   from memory.
4. **Examples are real where possible.** Every node has one. Pseudocode only where nothing executable
   exists, and then `note` starts with "Illustrative" or "Reconstruction" and says what is unverified.
5. **Tags, not labels.** Paradigms are concept tags; `milestones[].introduces` records when a language
   gained a concept. Convergence (Java gaining lambdas, C# gaining async) must stay visible.
6. **Edges point back in time,** stored once on the newer node. Inverses are derived; never store them.
7. **Claims get verdicts with quotes.** Popular stories (such as "C++ got OOP by accident") go into
   `data/claims.yaml` with located, verbatim evidence.

## Format: the short version

The full contract, with templates, is in **`docs/authoring.md`**. Read it before adding or changing records.
The rules people most often get wrong:

- Required on every node: `id`, `name`, `kind`, `cluster`, `origin.first_appeared.year` (integer),
  `summary`, `research_status`, `example`. `kind` and `category` are closed lists.
- One person per `creators` entry, spelled as their English Wikipedia article title, identically in every
  node: the viewer matches portraits by exact name.
- Every tag, `aspects` and `introduces` value is a concept id in `data/concepts.yaml`; every cluster path
  prefix exists in `data/clusters.yaml`.
- Quote versions (`"1.10"`), partial dates and YAML-1.1 booleans such as country code `"NO"`. Use `|2`
  when the first code line is indented.
- Put a new node in the file for its decade (machines and assembly in `01`, esoterics in `08`) and remove
  it from its cluster's `backlog`.
- Never hand-edit `data/media.yaml`; edit `data/media-subjects.yaml` and re-run `tools/fetch_media.py`.
- `build.py` must pass with 0 errors before a commit. Warnings about edges pointing forward in time mean
  the edge is reversed or needs a `year`.

## Skills for this project

- `research-language`: add a new language (or machine, assembler, esoteric) or deepen an existing node.
- `find-missing-languages`: survey for gaps, triage what belongs, and fill cluster backlogs.
- `map-relations`: find and verify influences, successions, dialects, concept origins, lineages and
  claims.

## Cloud sessions

Fresh clones start without Markus's latest commits: `git pull` first. Direct requests to wikipedia.org
and wikimedia.org are blocked from the sandbox, so read pages through the web-fetch tool, and leave
photo downloads to `tools/fetch_media.py` on Markus's machine.

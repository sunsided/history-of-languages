# Authoring reference: the data format

This is the contract between the YAML in `data/`, the validator (`tools/build.py`) and the viewer
(`viewer/vite/dataset.ts`, `viewer/src/lib/types.ts`). If something here and the schema disagree, the
schema (`schema/dataset.schema.json`) wins, and this file should be fixed.

Two readers parse the same files:

- `tools/build.py` uses PyYAML (YAML 1.1) and validates against the JSON Schema. Strict.
- The viewer uses the `yaml` npm package (YAML 1.2) and is lenient: it skips what it cannot use and lists
  it under "problems" in the toolbar. It never runs the schema.

Anything that passes `build.py` and follows the YAML style below renders in the viewer.

## YAML style (so both parsers agree)

- Quote every string that could be read as something else: versions (`"1.10"`, `"3.0"`), dates
  (`"1972-06"`), country codes that are YAML 1.1 booleans (`"NO"`, `"ON"`, `"Y"`), anything containing
  `: `, ` #`, `,` inside a flow mapping, or starting with `[ { * & ! | > ' " % @` or a backtick.
- Use `|` blocks for code. If the first line of the code is indented more than the rest, use `|2`
  (indentation indicator), or the block will not parse.
- Use `>` folded blocks for prose (`summary`, `notes`), flow mappings (`{ ... }`) for short records such as
  dating, creators, milestones and relations, as the existing files do.
- 2-space indentation. No tabs (Whitespace's example spells them out instead).
- Keep a blank line between top-level records. Never edit `data/media.yaml` by hand: it is generated.

## Files and where a new record goes

| file | holds | rule |
|---|---|---|
| `data/nodes/00-prehistory.yaml` | mechanisms, notations, formalisms before 1940 | |
| `data/nodes/01-machines-and-assembly.yaml` | every `machine`, `machine-code` and `assembly` node, any year | |
| `data/nodes/02-first-languages.yaml` … `07-2000s-2020s.yaml` | languages, by decade of first appearance | 02 = 1940s–1950s, 03 = 1960s, 04 = 1970s, 05 = 1980s, 06 = 1990s, 07 = 2000s and later |
| `data/nodes/08-esoteric.yaml` | `category: esoteric`, any year | |
| `data/clusters.yaml` | collapsible groups and their research backlog | one cluster per family or sub-family |
| `data/concepts.yaml` | every tag, aspect and `introduces` value | grouped by facet, alphabetical within a facet |
| `data/sources.yaml` | bibliography | append; ids never change once used |
| `data/lineages/*.yaml` | narrative threads | one file per theme |
| `data/claims.yaml` | myth vs fact checks | |
| `data/eras.yaml` | coarse periods | rarely touched |
| `data/media-subjects.yaml` | what to photograph: machines and creators | input to `tools/fetch_media.py` |

Inside a node file, keep records roughly in order of `first_appeared`. The viewer does not care about order
or about which file a node is in, but people reading the files do.

## Ids

- Lowercase, `[a-z0-9][a-z0-9+#._-]*`. Use the common name: `c`, `cpp`, `csharp`, `fsharp`, `objective-c`,
  `algol-60`, `asm-68k`, `x86-att-syntax`. Never reuse or rename an id: other records, lineages and
  links depend on it.
- Cluster ids are paths: `algol/wirth` is inside `algol`, and every prefix must exist as a cluster.
- Source ids: `author-year-short-title` (`ritchie-1993-development-c`); web pages `wiki-<slug>`,
  `esolangs-<slug>`; official sites `<thing>-faq`, `<thing>-spec`.
- Media subject ids: the node id for machines; `person-<first>-<last>` for people.

## Node

The viewer needs `id`, `name`, `kind`, `cluster`, `origin.first_appeared.year` (an integer), `summary` and
`research_status`. A node missing `first_appeared.year` is dropped from the timeline. `build.py`
additionally requires an `example` on every node.

A complete node, annotated (based on `zig`, with fields it does not have yet added for illustration):

```yaml
- id: zig
  name: Zig
  aliases: []                       # other names people search for (Golang, ECMAScript)
  kind: language                    # mechanism | machine | formalism | notation | machine-code | assembly | language
  category: systems                 # audience, not paradigm: general systems scientific business scripting shell
                                    #   query educational research domain-specific esoteric hardware
  cluster: c-family
  origin:
    began: { year: 2015, precision: circa, note: "..." }     # optional: design phase, drawn as a bar
    first_appeared: { year: 2016, precision: year }          # REQUIRED by the viewer: integer year
    places: [{ country: US }]                                # institution, city, country (ISO alpha-2, quote "NO")
  creators:
    - { name: Andrew Kelley, role: designer }   # ONE person per entry, named as their English Wikipedia article
  status: active                    # active | maintained | legacy | historical | extinct
  tags:                             # every value is a concept id; describes the language as of today
    paradigm: [imperative, procedural, generic-programming]
    typing: [static-typing]
    memory: [manual-memory]
    features: [compile-time-evaluation, c-interop]
  milestones:                       # versions that matter; `introduces` = concepts that arrived in this version
    - { version: "0.11", year: 2023, summary: "async/await removed." }
  summary: >
    One paragraph: what it is, what it took from whom, why it matters in this graph.
  notes: >
    Optional: disputes, caveats, what is still unverified.
  relations:                        # stored on the NEWER node, pointing back in time
    - { type: influenced_by, to: c, weight: strong, confidence: high }
    - { type: influenced_by, to: d, aspects: [compile-time-evaluation], weight: moderate, confidence: medium }
  research_status: draft            # stub | draft | reviewed
  confidence: medium                # how sure the dating and attribution are
  links: { wikipedia: "https://en.wikipedia.org/wiki/Zig_(programming_language)", homepage: "https://ziglang.org" }
  sources: [wiki-zig]
  example:
    title: comptime generics        # what the sample shows
    language: Zig                   # dialect or version the code is written in
    year: 2024                      # optional: year of the dialect or of the published original
    note: "Where it comes from, and whether it is illustrative or reconstructed."
    code: |
      fn Stack(comptime T: type, comptime n: usize) type {
          return struct { items: [n]T = undefined, len: usize = 0 };
      }
    sources: [wiki-zig]
```

### Field rules

- **kind** and **category** are closed lists. Adding a value needs a viewer change (see the end of this
  file) as well as a schema change.
- **dating.precision**: `exact` (a dated release or document), `year`, `circa`, `decade`, `range` (with
  `year_end`), `disputed` (say why in `note`). Use `began` for a long design phase (ALGOL 68, Ada, Rust).
- **creators**: one person per entry, named exactly as the title of their English Wikipedia article
  (`Tony Hoare`, not `C. A. R. Hoare`; `Jean Bartik`, with the name used at the time in `role`). The viewer
  attaches a portrait by exact name match, so the same person must be spelled the same in every node. A
  committee or company is allowed as its own entry (`Common Lisp committee`, `US Department of Defense`)
  when no individual is meant; put membership in `affiliation`. `build.py` rejects names that contain a
  comma, " and " or parentheses.
- **tags** say what is true today. **milestones[].introduces** says when a concept arrived in this
  language, and that is what makes convergence visible (Java gets `lambdas` in 8). If a tag was not there
  from the start and you know when it came, add the milestone.
- **summary**: plain prose, 2 to 5 sentences, no Markdown. Lead with what is distinctive and its place in
  the graph.
- **research_status**: `stub` = name, date and cluster only; `draft` = filled from secondary sources and
  well-established histories; `reviewed` = every claim on the node checked against a primary source, with
  those sources marked `checked`. Do not raise to `reviewed` without re-reading.
- **links.wikipedia**: full URL. The viewer shows it as a link.

### Examples (every node has one)

- Prefer real, sourced code: the language's own report or manual, the designer's paper, HOPL papers, a
  period listing, or Wikipedia's sample when it cites one. Name the source in `example.sources`.
- Use period-accurate syntax for the node's own era (FORTRAN II in capitals with fixed columns, LISP 1.5
  M-expressions or S-expressions as published). If you use a later dialect, say so in `language`.
- Machine code may be octal or hex with a comment column. Assembly should use the period assembler's
  mnemonics.
- Pseudocode is allowed only where nothing executable exists (mechanisms, formalisms, image-based
  languages such as Piet, hostile languages such as Malbolge). Say "Illustrative" or "Reconstruction" at
  the start of `note` when the code is not a documented original, and say what is unverified.
- Keep it under about 25 lines; it is shown in a hover tooltip. Show what makes the language itself, not
  Hello World, unless Hello World is the point (esoterics).
- The viewer shows `code` in a `<pre>` exactly as written, after trimming trailing whitespace. Align
  columns with spaces.
- Test it if a toolchain exists (gcc, nasm, gforth, swipl, ghc, ...).

### Relations

| type | stored on | use for |
|---|---|---|
| `influenced_by` | newer node | design influence; list `aspects` (concept ids) that travelled |
| `successor_of` | newer node | intended replacement in the same line (ALGOL W → Pascal is influence; Modula-2 → Oberon is succession) |
| `dialect_of` | variant | same language, different variant (MACLISP of LISP 1.5) |
| `superset_of` / `subset_of` | variant | syntactic or semantic inclusion (C++ superset of C, roughly) |
| `fork_of` | fork | codebase or community fork |
| `targets` | assembly or language | assembly → its machine; a language → the machine it was built for |
| `implemented_in` | the implemented node | bootstrapping history worth showing (C in B, then C) |

- Always newer → older. `build.py` warns when an edge points more than 3 years forward in time. When a
  later version adopted the idea, set `year` on the relation (JavaScript got async/await from C# in 2017).
- `weight`: `strong` = a defining trait came from there; `moderate` = clear but partial; `weak` = a
  detail or a general atmosphere.
- `confidence`: `high` = the designers say so in a primary source; `medium` = consistent secondary
  sources; `low` = plausible hypothesis. A `low` edge needs a `note` saying what would confirm it.
- No self edges and no duplicate `(type, to)` pairs on one node (`build.py` rejects both).
- Inverse edges (`influenced`, `superseded_by`, ...) are derived. Never store them.

## Cluster

```yaml
- id: c-family/safe
  name: Safe systems languages
  parent: c-family                  # must match the id prefix
  summary: "One line, shown in the viewer."
  collapsed: true                   # optional: start folded in the viewer
  research_status: draft            # stub | draft | reviewed, for the cluster as a whole
  backlog:                          # members still to add, with enough to start researching
    - { name: "Carbon", year: 2022, hint: "Google's C++ successor experiment." }
  research_questions:
    - "Did Cyclone's regions directly inform Rust's lifetimes? Find Graydon Hoare's statements."
  key_sources: [jim-2002-cyclone]
```

When a backlog item becomes a node, delete it from the backlog in the same change.

## Concept

```yaml
- id: async-await
  name: Async await
  facet: concurrency                # paradigm | typing | memory | concurrency | features | domain
  broader: [coroutines, futures-promises]
  summary: One sentence, plain.
  first_seen: { node: fsharp, year: 2007, note: "F# async workflows; C# 5 (2012) gave the keywords." }
  sources: []
```

`first_seen` names the earliest node in this dataset credited with the concept, with the year it arrived
(which may be a milestone year, not the node's first appearance). Check it whenever you tag an older node
with the concept: `python3 tools/report.py concepts` lists contradictions. Before creating a concept, look
for an existing one (`python3 tools/report.py find <word>`); prefer making a new one narrower than an
existing one through `broader`.

## Source

```yaml
- id: ritchie-1993-development-c
  type: paper                       # paper book chapter report standard manual web talk interview encyclopedia
  primary: true                     # written by the creators, or at the time
  authors:
  - Dennis M. Ritchie
  title: The Development of the C Language
  venue: HOPL II
  year: 1993
  url: https://...                  # where it can be read; add doi when there is one
  checked: '2026-11-01'             # only after actually reading it against the claims that cite it
```

## Lineage and claim

A lineage is an ordered story through the graph (`steps[]` with `year`, `title`, `text`, `nodes`,
`concepts`, `systems` for non-language artefacts such as operating systems, and `sources`). A claim is a
fact check: `claim`, `verdict` (`confirmed`, `mostly-true`, `nuanced`, `mostly-false`, `false`,
`unresolved`), `summary`, and `evidence[]` with `source`, `locator` (page or section) and a verbatim
`quote`. See `data/lineages/oop.yaml` and `data/claims.yaml` for complete examples.

## Media

`data/media-subjects.yaml` is hand-written; `data/media.yaml` and `assets/media/` are generated by
`tools/fetch_media.py`, which only runs where Wikimedia is reachable (not from the cloud sandbox).

```yaml
- id: person-grace-hopper
  kind: person                      # machine | person | document | artifact
  person: Grace Hopper              # must equal a creators[].name exactly
  wiki: Grace Hopper                # English Wikipedia article whose lead image is used
  nodes: [a-0, flow-matic, cobol]
  # optional: commons_file: "File:...", caption: "...", skip: true
```

Only freely licensed Commons files are kept. The viewer must show `credit` and `license` with every image.

## Changes that need the viewer too

The viewer hard-codes a few closed lists. Changing any of these in the schema without the viewer breaks
colours, filters or labels:

| change | schema | viewer |
|---|---|---|
| new node `kind` | `$defs.node.kind` | `viewer/src/app.css` (`--kind-*`, light and dark), `.kind-*` classes in `Timeline.svelte` and `DetailPanel.svelte`, `KINDS` in `Toolbar.svelte`, `LangNode` in `types.ts` |
| new relation `type` | `$defs.relation.type`, `INVERSE` in `tools/build.py` | `RelationType` in `types.ts`; `FAMILY_OF`, `FORWARD_LABEL`, `BACKWARD_LABEL` in `src/lib/graph.ts` |
| new tag facet | `$defs.node.tags`, `$defs.concept.facet` | works (facets are read dynamically) |
| new field on any record | the record's `$defs` (they all set `additionalProperties: false`) | add it to `types.ts` if the viewer should show it |
| new top-level data file | `tools/build.py` loader | `loadDataset` in `viewer/vite/dataset.ts` |

After a viewer change, run `task check`.

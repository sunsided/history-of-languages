#!/usr/bin/env python3
"""Find, license-check and download photos for machines and people.

Reads data/media-subjects.yaml, asks the Wikipedia and Wikimedia Commons APIs for each subject's image,
keeps only files hosted on Commons under a free license, writes data/media.yaml (credit, license,
caption, source) and downloads an 800px version of each image into assets/media/.

Usage:
  python3 tools/fetch_media.py              # resolve + download everything missing
  python3 tools/fetch_media.py --dry-run    # resolve and print, write nothing
  python3 tools/fetch_media.py --refresh    # re-download files that already exist

Needs only the standard library and pyyaml. Re-running is safe: existing files are skipped.
Every run prints the subjects that were skipped and why (no image, not on Commons, non-free license).
"""
import html, json, pathlib, re, sys, time, urllib.parse, urllib.request
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUBJECTS = ROOT / "data" / "media-subjects.yaml"
OUT = ROOT / "data" / "media.yaml"
ASSETS = ROOT / "assets" / "media"
WIDTH = 800
UA = "history-of-languages-dataset/0.1 (https://github.com/sunsided/history-of-languages)"
WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
FREE = re.compile(r"^(public domain|pd\b|pd-|cc0|cc[ -]by|gfdl|attribution|no restrictions)", re.I)


def api(base, **params):
    params.update(format="json", formatversion="2")
    url = base + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # network hiccup or 429: back off
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def chunks(xs, n=50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def lead_images(titles):
    """Wikipedia article title -> 'File:...' of its lead image (or None)."""
    found = {}
    for batch in chunks(titles):
        d = api(WIKI_API, action="query", prop="pageimages", piprop="name", redirects="1", titles="|".join(batch))
        q = d.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for m in q.get(kind, []):
                alias[m["to"]] = m["from"]
        for p in q.get("pages", []):
            t = p["title"]
            orig = t
            while orig in alias:
                orig = alias[orig]
            found[orig] = ("File:" + p["pageimage"]) if p.get("pageimage") else None
    return found


def commons_info(files):
    """'File:...' -> imageinfo dict, or None when the file is not on Commons (usually a non-free local upload)."""
    info = {}
    for batch in chunks(files):
        d = api(COMMONS_API, action="query", prop="imageinfo", iiprop="url|extmetadata|mime",
                iiurlwidth=str(WIDTH), titles="|".join(batch))
        q = d.get("query", {})
        alias = {m["to"]: m["from"] for m in q.get("normalized", [])}
        for p in q.get("pages", []):
            key = alias.get(p["title"], p["title"])
            info[key] = None if p.get("missing") or "imageinfo" not in p else p["imageinfo"][0]
    return info


def main():
    dry = "--dry-run" in sys.argv
    refresh = "--refresh" in sys.argv
    subjects = [s for s in yaml.safe_load(SUBJECTS.read_text(encoding="utf-8")) if not s.get("skip")]

    need_lead = [s["wiki"] for s in subjects if not s.get("commons_file")]
    leads = lead_images(need_lead) if need_lead else {}
    for s in subjects:
        s["_file"] = s.get("commons_file") or leads.get(s["wiki"])

    files = sorted({s["_file"] for s in subjects if s["_file"]})
    info = commons_info(files) if files else {}

    media, skipped = [], []
    for s in subjects:
        f = s["_file"]
        if not f:
            skipped.append((s["id"], "article has no lead image"))
            continue
        ii = info.get(f)
        if ii is None:
            skipped.append((s["id"], f"{f} is not on Commons (likely non-free)"))
            continue
        md = ii.get("extmetadata", {})
        val = lambda k: (md.get(k) or {}).get("value", "")
        lic = strip_html(val("LicenseShortName"))
        if val("NonFree").lower() == "true" or not FREE.match(lic):
            skipped.append((s["id"], f"{f}: license '{lic}' is not free"))
            continue
        ext = pathlib.PurePosixPath(urllib.parse.urlparse(ii.get("thumburl") or ii["url"]).path).suffix.lower() or ".jpg"
        if ext == ".svg":
            ext = ".png"  # Commons renders SVG thumbnails as PNG
        local = f"assets/media/{s['id']}{ext}"
        date = strip_html(val("DateTimeOriginal"))[:40]
        desc = strip_html(val("ImageDescription"))
        if s.get("caption"):
            caption = s["caption"]
        elif s["kind"] == "person":
            caption = s["person"] + (f", {date}" if date else "")
        else:
            caption = (desc[:240] + "…") if len(desc) > 240 else (desc or s["wiki"])
        entry = {
            "id": s["id"], "file": local, "kind": s["kind"],
            **({"person": s["person"]} if s.get("person") else {}),
            "nodes": s.get("nodes", []),
            "caption": caption,
            **({"date": date} if date else {}),
            "credit": strip_html(val("Artist")) or strip_html(val("Credit")) or "unknown",
            "license": lic,
            **({"license_url": val("LicenseUrl")} if val("LicenseUrl") else {}),
            "source_url": ii.get("descriptionurl", "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(f.replace(" ", "_"))),
            "commons_file": f,
            "checked": time.strftime("%Y-%m-%d"),
        }
        media.append(entry)
        if dry:
            continue
        target = ROOT / local
        if target.exists() and not refresh:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(ii.get("thumburl") or ii["url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            target.write_bytes(r.read())
        time.sleep(0.2)  # be polite to upload.wikimedia.org

    print(f"{len(media)} images with free licenses, {len(skipped)} skipped")
    for sid, why in skipped:
        print(f"  skipped {sid}: {why}")
    if dry:
        print(yaml.safe_dump(media[:3], sort_keys=False, allow_unicode=True))
        return 0
    header = ("# GENERATED by tools/fetch_media.py from data/media-subjects.yaml. Do not edit by hand:\n"
              "# put overrides (commons_file, caption, skip) into media-subjects.yaml and re-run.\n"
              "# Credit and license come from each file's Commons page; the site must show them.\n")
    OUT.write_text(header + yaml.safe_dump(media, sort_keys=False, allow_unicode=True, width=200), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} and {ASSETS.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())

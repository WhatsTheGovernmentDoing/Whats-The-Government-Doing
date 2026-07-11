"""Refresh the senators dataset (Site/senators.json) from sencanada.ca.

Senators are appointed by province/region, so the action site pairs a visitor
with senators from their province. This dataset is baked into the static site
(assets/data.js) — the visitor's browser never contacts anything to find one.

Run occasionally (appointments/retirements change it):
    python Site/fetch_senators.py
then rebuild:
    python Site/build_site.py
"""

import html as html_mod
import json
import re
import urllib.request
from pathlib import Path

SITE = Path(__file__).resolve().parent
BASE = "https://sencanada.ca/umbraco/surface/SenatorsAjax/GetSenators"
UA = {"User-Agent": "Mozilla/5.0 (bills-action-site data refresh)"}


def get(display_for: str) -> str:
    url = f"{BASE}?displayFor={display_for}&Lang=en"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def parse_list(html: str):
    """senatorslist partial -> {slug: {name, affiliation, province}}"""
    out = {}
    rows = re.findall(r"<tr>(.*?)</tr>", html, re.S)
    for row in rows:
        m = re.search(r'href="(/en/senators/[^"]+)">([^<]+)</a>', row)
        if not m:
            continue
        slug = m.group(1)
        name = html_mod.unescape(m.group(2)).strip()
        # drop honorifics that break "Last, First" parsing (e.g. "Carignan, P.C., Claude")
        name = re.sub(r",\s*P\.?C\.?(?=,|$)", "", name).strip()
        aff = re.search(r'data-search="aff-([A-Za-z]*)-?"', row)
        prov = re.search(r'data-search="province-([A-Z]{2})"\s+data-order="([^"]+)"', row)
        if not prov:
            continue
        out[slug] = {
            "name": name,
            "affiliation": aff.group(1) if aff else "",
            "prov": prov.group(1),
            "province": prov.group(2).strip(),
        }
    return out


def parse_contacts(html: str):
    """senatorscontactinformation partial -> {slug: email}"""
    out = {}
    rows = re.findall(r"<tr>(.*?)</tr>", html, re.S)
    for row in rows:
        m = re.search(r'href="(/en/senators/[^"]+)"', row)
        e = re.search(r'mailto:([^"]+)"', row)
        if m and e:
            out[m.group(1)] = e.group(1).strip()
    return out


def main():
    listing = parse_list(get("senatorslist"))
    contacts = parse_contacts(get("senatorscontactinformation"))

    senators = []
    missing_email = []
    for slug, info in listing.items():
        email = contacts.get(slug, "")
        if not email:
            missing_email.append(info["name"])
            continue
        senators.append(
            {
                "name": info["name"],  # "Last, First" as listed
                "prov": info["prov"],
                "province": info["province"],
                "affiliation": info["affiliation"],
                "email": email,
                "url": f"https://sencanada.ca{slug}",
            }
        )

    senators.sort(key=lambda s: (s["prov"], s["name"]))
    out = SITE / "senators.json"
    out.write_text(json.dumps(senators, ensure_ascii=False, indent=1), encoding="utf-8")

    provs = {}
    for s in senators:
        provs[s["prov"]] = provs.get(s["prov"], 0) + 1
    print(f"Wrote {len(senators)} senators to {out.name}")
    print("  by province:", ", ".join(f"{k}:{v}" for k, v in sorted(provs.items())))
    if missing_email:
        print(f"  ! no email listed (excluded): {', '.join(missing_email)}")


if __name__ == "__main__":
    main()

"""Mechanical stage sync for the action site — no new words, ever.

Pulls the current status of every bill that has a Bills/<n>/action.json from
LEGISinfo (same source the pipeline engine uses) and updates the mechanical
fields only: status, status_label, law_date. All rendered text is pre-approved
template language keyed off these fields, so this sync introduces zero
editorial content — which is why it is allowed to auto-deploy (user decision
2026-07-11). Also refreshes senators.json when it is older than 14 days.

Usage:
    python Site/sync_status.py               # sync + rebuild + deploy if changed
    python Site/sync_status.py --no-deploy   # sync + rebuild only (testing)
    python Site/sync_status.py --dry-run     # report what would change
"""

import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent
API_URL = "https://www.parl.ca/legisinfo/en/bills/json?parlsession={session}"
UA = {"User-Agent": "whats-the-government-doing site sync"}


def fetch_session_bills(session):
    req = urllib.request.Request(API_URL.format(session=session), headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def classify(status_en, royal_assent):
    """LEGISinfo CurrentStatusEn -> (site status key, law_date or None)."""
    s = (status_en or "").lower()

    if "royal assent received" in s or royal_assent:
        date = None
        if royal_assent:
            # e.g. "2026-06-15T00:00:00" -> "June 15, 2026"
            dt = datetime.fromisoformat(royal_assent.split(".")[0])
            date = f"{dt.strftime('%B')} {dt.day}, {dt.year}"
        return "law", date
    if "awaiting royal assent" in s:
        return "awaiting-ra", None
    if any(w in s for w in ("defeated", "not proceeded with", "withdrawn", "died")):
        return "died", None

    if "awaiting first reading in the senate" in s:
        return "senate-1st", None
    if "awaiting first reading in the house" in s:
        return "house-1st", None

    chamber = "senate" if "senate" in s else "house"
    if "second reading" in s:
        stage = "2nd"
    elif "third reading" in s:
        stage = "3rd"
    elif "committee" in s:
        stage = "committee"
    elif "report stage" in s:
        stage = "report"
    elif "first reading" in s:
        stage = "1st"
    else:
        return None, None  # unrecognized — leave the file alone, report it
    return f"{chamber}-{stage}", None


def sync():
    action_files = sorted(ROOT.glob("Bills/*/action.json"))
    if not action_files:
        print("No action.json files found.")
        return False

    sessions = {}
    for af in action_files:
        data = json.loads(af.read_text(encoding="utf-8"))
        sessions.setdefault(data.get("session", "45-1"), []).append((af, data))

    changed = []
    for session, entries in sessions.items():
        bills = fetch_session_bills(session)
        by_code = {b["BillNumberFormatted"].upper(): b for b in bills}
        time.sleep(0.3)  # be polite to parl.ca

        for af, data in entries:
            code = data["bill"].upper()
            b = by_code.get(code)
            if not b:
                print(f"  ? {code}: not found in LEGISinfo {session} — skipped")
                continue
            status_en = b.get("CurrentStatusEn", "")
            new_status, law_date = classify(status_en, b.get("ReceivedRoyalAssentDateTime"))
            if new_status is None:
                print(f"  ? {code}: unrecognized status '{status_en}' — left alone")
                continue

            new_label = (
                f"Now law — royal assent {law_date}" if new_status == "law" and law_date
                else status_en
            )
            updates = {}
            if data.get("status") != new_status:
                updates["status"] = new_status
            if data.get("status_label") != new_label:
                updates["status_label"] = new_label
            if law_date and data.get("law_date") != law_date:
                updates["law_date"] = law_date

            if updates:
                changed.append(f"{code}: {data.get('status')} -> {new_status} ({status_en})")
                if "--dry-run" not in sys.argv:
                    data.update(updates)
                    af.write_text(
                        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )

    if changed:
        print("Stage changes:" if "--dry-run" not in sys.argv else "Would change:")
        for c in changed:
            print(f"  {c}")
    else:
        print("All statuses already current.")
    return bool(changed)


def refresh_senators_if_stale():
    sj = SITE / "senators.json"
    if sj.exists() and time.time() - sj.stat().st_mtime < 14 * 86400:
        return False
    print("senators.json is stale (>14 days) — refreshing…")
    try:
        subprocess.run([sys.executable, str(SITE / "fetch_senators.py")], check=True)
        return True
    except Exception as e:
        print(f"  ! senators refresh failed ({e}) — continuing with existing data")
        return False


def main():
    dry = "--dry-run" in sys.argv
    changed = sync()
    senators_changed = False if dry else refresh_senators_if_stale()

    if dry:
        return
    if not (changed or senators_changed):
        return

    print("Rebuilding site…")
    subprocess.run([sys.executable, str(SITE / "build_site.py")], check=True)

    if "--no-deploy" in sys.argv:
        print("(--no-deploy: skipping deploy)")
        return
    subprocess.run(
        [sys.executable, str(SITE / "deploy.py"), "--message", "mechanical stage sync"],
        check=True,
    )


if __name__ == "__main__":
    main()

"""Deploy the built site to GitHub Pages (git add/commit/push of Site/).

The Site/ folder is its own git repository, pushed to a public GitHub repo
with Pages enabled. Deploying = committing whatever build_site.py produced
and pushing. This is the ONLY outward-publishing step for the website — it
is run by /post_approved (after the human gate) and by sync_status.py
(mechanical stage syncs only, pre-approved template text).

Usage:
    python Site/deploy.py                        # commit + push everything
    python Site/deploy.py --message "C-29 live"  # custom commit message

One-time setup (see README "How to launch it"):
    cd Site
    git init -b main
    git remote add origin https://github.com/<you>/<repo>.git
    git add -A && git commit -m "first deploy" && git push -u origin main
    then enable Pages: repo Settings -> Pages -> Deploy from a branch -> main
"""

import subprocess
import sys
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent


def git(*args, check=True):
    return subprocess.run(
        ["git", *args], cwd=SITE, check=check, capture_output=True, text=True
    )


def classify_changes(porcelain: str):
    """Split `git status --porcelain` into (mechanical, needs_approval).

    A mechanical stage sync only ever EDITS files that already exist —
    assets/data.js and senators.json. It never creates, deletes or renames
    anything. So anything that isn't a plain modification of a tracked file
    came from somewhere else and has not been through the human gate.
    """
    mechanical, needs_approval = [], []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        code, path = line[:2], line[3:].strip()
        # 'M' in either column = modified tracked file. '??' = untracked/new,
        # 'A' = added, 'D' = deleted, 'R' = renamed.
        if set(code.strip()) <= {"M"} and code.strip():
            mechanical.append(path)
        else:
            needs_approval.append(f"{code.strip() or '??'} {path}")
    return mechanical, needs_approval


def main():
    msg = f"site update {date.today().isoformat()}"
    if "--message" in sys.argv:
        msg = sys.argv[sys.argv.index("--message") + 1] + f" ({date.today().isoformat()})"

    mechanical_only = "--mechanical" in sys.argv

    if not (SITE / ".git").exists():
        print("Site/ is not a git repository yet — one-time setup needed:")
        print(__doc__.split("One-time setup")[1])
        sys.exit(1)

    # NOTE: rstrip("\n") only, never .strip() — porcelain's first column is a
    # space for worktree-only changes (" M assets/data.js"). Stripping the whole
    # block ate that space on the FIRST line, shifting the path slice by one and
    # producing "ssets/data.js", which crashed `git add`. That silently broke
    # every mechanical sync between 2026-08-27 and 2026-09-10.
    status = git("status", "--porcelain").stdout.rstrip("\n")
    if not status.strip():
        print("Nothing to deploy — working tree clean.")
        return

    if mechanical_only:
        # ---------------------------------------------------------------
        # THE GUARD (added 2026-08-27).
        # Before this, sync_status.py called a plain `git add -A`, which
        # published whatever happened to be sitting in Site/. On 2026-08-26
        # that swept up a 7-slide primer that had been waiting since July 12
        # and put it on the public site without anyone approving it.
        # A mechanical sync may now ONLY push edits to existing files.
        # ---------------------------------------------------------------
        mechanical, needs_approval = classify_changes(status)
        if needs_approval:
            print("HELD — this is a mechanical sync, but the working tree has changes")
            print("that add, delete or rename files. Those never come from a stage sync,")
            print("so nothing was published. Nothing has been lost; it is all still here.")
            print()
            for item in needs_approval:
                print(f"    {item}")
            print()
            print("If you meant to publish these, review them and run:")
            print('    python "Site/deploy.py" --message "your description"')
            print()
            print("The site was NOT updated, including the stage changes, because")
            print("assets/data.js may reference the files above.")
            sys.exit(0)

        if not mechanical:
            print("Nothing mechanical to deploy.")
            return
        for path in mechanical:
            git("add", "--", path)
    else:
        git("add", "-A")

    staged = git("diff", "--cached", "--name-only").stdout.strip()
    if not staged:
        print("Nothing staged — nothing to deploy.")
        return

    git("commit", "-m", msg)
    push = git("push", check=False)
    if push.returncode != 0:
        print("Push failed:")
        print(push.stderr.strip())
        print("(Check the remote / your GitHub sign-in, then run: python Site/deploy.py)")
        sys.exit(1)
    n = len(staged.splitlines())
    label = "mechanical " if mechanical_only else ""
    print(f"Deployed ({label}): {n} file(s) changed — '{msg}'")
    print("GitHub Pages updates within ~1 minute.")


if __name__ == "__main__":
    main()

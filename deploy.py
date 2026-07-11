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


def main():
    msg = f"site update {date.today().isoformat()}"
    if "--message" in sys.argv:
        msg = sys.argv[sys.argv.index("--message") + 1] + f" ({date.today().isoformat()})"

    if not (SITE / ".git").exists():
        print("Site/ is not a git repository yet — one-time setup needed:")
        print(__doc__.split("One-time setup")[1])
        sys.exit(1)

    status = git("status", "--porcelain").stdout.strip()
    if not status:
        print("Nothing to deploy — working tree clean.")
        return

    git("add", "-A")
    git("commit", "-m", msg)
    push = git("push", check=False)
    if push.returncode != 0:
        print("Push failed:")
        print(push.stderr.strip())
        print("(Check the remote / your GitHub sign-in, then run: python Site/deploy.py)")
        sys.exit(1)
    n = len(status.splitlines())
    print(f"Deployed: {n} file(s) changed — '{msg}'")
    print("GitHub Pages updates within ~1 minute.")


if __name__ == "__main__":
    main()

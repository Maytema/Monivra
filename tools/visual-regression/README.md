# Visual regression tools

Used to prove that a refactoring did not change what the app looks like or how it behaves.
Requires Node 18+ and Playwright (`npm i -D playwright && npx playwright install chromium`).

```bash
# 1. serve the version you trust (e.g. `git stash` / another checkout) and record it
python3 -m http.server 8801 &
node tools/visual-regression/crawl.mjs record http://localhost:8801/index.html before.json

# 2. serve the changed version and replay the same click paths
node tools/visual-regression/crawl.mjs replay http://localhost:8801/index.html after.json before.json

# 3. compare
node tools/visual-regression/compare.mjs before.json after.json
```

`record` writes `<result>.shots/` with a PNG per screen. `compare.mjs` lists every screen whose
screenshot, text or number of clickable controls differs. The balance counter in the header
animates for a moment after toggling visibility, so that area can differ between runs.

`swipe.mjs <urlA> <urlB>` performs the same touch swipes on two builds and compares screenshots.

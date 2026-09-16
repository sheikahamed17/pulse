# Screenshots

Drop app screenshots here to fill the gallery in the main
[README](../../README.md#screenshots). It expects these **exact filenames**
(phone-portrait PNGs look best — commit full-res and let GitHub scale them down):

| File | What to capture |
|---|---|
| `capture.png` | The capture bar / a confirmation chip right after typing or speaking an entry |
| `money.png` | The **Money** tab — the entries list plus a budget progress bar |
| `dashboard.png` | `/dashboard` — the widgets (accounts · upcoming · goals · habits) + Getting Started |
| `analytics.png` | `/analytics` — a spend-trend or net-worth chart |
| `assistant.png` | `/assistant` — an "ask your data" question and its answer |
| `insights.png` | `/insights` — a weekly digest |

## How to capture (iOS PWA)

1. Open your instance, sign in, and add a few realistic (non-sensitive) entries.
2. On each screen, take a screenshot (side button + volume-up).
3. AirDrop / email them to your machine and rename to the filenames above.
4. Drop them in this folder and commit — the README gallery fills automatically:

   ```bash
   git add docs/screenshots/*.png
   git commit -m "docs: add app screenshots"
   git push
   ```

**Tip:** a clean status bar and a couple of realistic-but-not-private entries
read best. Once the images are in, you can also lift the gallery out of the
`<details>` block in the README if you'd rather show it expanded by default.

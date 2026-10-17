# Git Vigil

A full-screen reading of a repository's history, opened inside the editor or from
a terminal. It runs `git log` and renders what the timestamps already know: the
hours the project kept, the days that ran past midnight, the commits written
before 05:00, the messages nobody was proud of, and the people who stopped coming.

## Use

`Cmd/Ctrl + Shift + P` → **Git Vigil: Keep the vigil**, or click `vigil` in the
status bar. Or without the editor:

```
node src/cli.js /path/to/repository              # writes preview/<repo>.vigil.html
node src/cli.js /path/to/repository --json       # the summary, for scripting
node src/cli.js . --max-commits 200000 --stat-commits 20000
```

Everything is computed locally from `git log`; nothing is uploaded, and git is
always spawned with `execFile` and no shell.

## What it reports

| | source |
| --- | --- |
| The hours you kept | commits per author-local hour, and the latest pre-05:00 commit |
| The days | per-week lifeline, 53-week heatmap, longest and trailing streaks |
| The weight | lines added and removed, files touched, days over ten hours long |
| The confession | recurring `fix` / `typo` / `revert` / `sorry` messages, and samples |
| Who kept it | people (emails merged into one human), and who went silent |
| Letters | prose generated only from the numbers above |

Truncation and partial windows are printed on the page rather than hidden: if the
history was capped, or the line counts cover only a window of recent commits, the
vigil says so under the heading.

## Layout

| path | role |
| --- | --- |
| `src/git.js` | spawns git, parses NUL-delimited log records and `--numstat` |
| `src/analyze.js` | pure reducer: commits in, summary object out |
| `src/render.js` | the webview document — CSS, SVG charts, and the generated letters |
| `src/extension.js` | commands, panel lifecycle, progress, error states |
| `src/cli.js` | the same pipeline with no editor attached |
| `preview/build.js` | synthetic history generator, for working on the layout offline |

## Verified against real repositories

Measured on genuine upstream history (clones are not committed):

- **git.git** — 60,000 of 61,160 non-merge commits, 2,373 people, 2005 → 2026.
  8,086 pre-dawn commits, peak hour 15:00, longest streak 290 days, 6,017
  messages containing "fix". Runs in ~6 s.
- **sindresorhus/is** — 257 commits, 53 people, one maintainer. Runs in ~0.2 s.

## Install for development

Press `F5` in this folder to launch the Extension Development Host, then run the
command there. `npx @vscode/vsce package` produces a `.vsix` to install with
*Extensions: Install from VSIX*.

## Settings

- `gitVigil.maxCommits` (default 60000) — history read per run
- `gitVigil.statCommits` (default 6000) — how many recent commits to diff for line
  counts. This dominates the cost: git spent ~36 s diffing 60,000 commits of
  git.git, versus 0.9 s for the metadata pass that produces every other number.
- `gitVigil.includeAllBranches` (default true) — every reachable branch, or only the current one

## License

Git Vigil is released under the **Jovian Source-Available License v1.0** (Targeted Exclusion Variant). See `LICENSE` for details.

**CRITICAL:** This software is **NOT** licensed to DrevOps or Alex Skrypnyk. Any utilization, cloning, forking, integration, referencing, or packaging by, for, or on behalf of DrevOps or Alex Skrypnyk is strictly prohibited and constitutes an immediate, material breach of this license agreement and international copyright law.

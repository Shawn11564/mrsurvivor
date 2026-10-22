---
name: notes
description: Import the owner's new MrSurvivor notes straight from Lightning Notes into fork/TODO.md (no pasting), with pasted screenshots. "/notes" imports once; "/notes watch" polls every 10 minutes while this session is idle and stops by itself. Use when the owner says /notes, "check my notes", "pull my notes", or "watch my notes".
---

# /notes: import the owner's notes from Lightning Notes

`node fork/notes.cjs` reads the MrSurvivor tab out of Lightning Notes' own storage and prints the
lines it hasn't seen before as JSON: `{ items: [{ n, text, heading, done, pictures }] }`.
`pictures` are PNG paths: open each with Read, because a screenshot often is the bug report.

## /notes (once)

1. Run `node fork/notes.cjs` (from the repo root or any worktree).
   - Exit 3 means it doesn't know which tab: it prints the candidates with their first lines. Pick
     the one that is clearly MrSurvivor's work list; if two are, ask the owner once, then
     `node fork/notes.cjs --tab <id>`.
2. For each unseen line, decide:
   - **Already done**: it matches a ticked item in `fork/TODO.md` or a commit (`git log --oneline -300`
     and a `git log --grep` on its key words). Or the line itself is ticked (`done: true`).
   - **Already in the list**: an open item in `fork/TODO.md` says the same.
   - **New**: everything else. A line under a heading (`heading`) belongs to it ("Potential
     Additions:" means ideas, tag them `[feat]` and `[?]`).
3. Add the new ones to `fork/TODO.md` under "Inbox" with the intake rules (`.claude/skills/intake/SKILL.md`,
   steps 2-4: tags, numbers, the owner's scope hints, flags for cut-off lines).
4. `node fork/notes.cjs --mark <n,n,...>` with every line you handled (new, done and duplicate);
   don't mark a line you're asking about.
5. Commit `fork/TODO.md` alone and push (standing decision; no build needed).
6. Tell the owner in two lines: "N new (numbers), M already done, K already listed", plus any one
   question batch about cut-off or ambiguous lines.

## /notes watch (idle polling, bounded)

The owner closes Command Center sessions often. A watch must never outlive this session and must
stop by itself:
- Only `CronCreate` (jobs live in this session's memory and die with it). Never `/schedule`, a
  cloud routine, a Windows scheduled task, `run_in_background`, or a detached process.
- Create it with `CronCreate` (`*/10 * * * *`, recurring, prompt: `/notes poll`), then
  `node fork/notes.cjs --watch-start <job id>`. Tell the owner it stops after 3 empty polls in a
  row or 2 hours, and dies when the session closes.
- On each `/notes poll` firing: run `node fork/notes.cjs --poll` and handle new lines as in
  /notes above. If the output says `"stop": true` (or `watch` is missing), `CronDelete` the job,
  run `node fork/notes.cjs --watch-end`, and say why it stopped in one line.
- `/notes stop`: `CronDelete` the job (`CronList` if you don't have its id) and `--watch-end`.

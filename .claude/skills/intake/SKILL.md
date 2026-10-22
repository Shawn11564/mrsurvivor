---
name: intake
description: Turn a pasted dump of the owner's MrSurvivor notes (Lightning Notes, any list) into numbered, tagged items in fork/TODO.md, asking at most one batch of questions. Use when the owner says /intake followed by a paste, or pastes a list of bugs/features and asks to add or queue them.
---

# /intake <paste>: the owner's list into fork/TODO.md

1. **Split** the paste into items: one per line or bullet (`- [ ]`, `- []`, `-`, numbers). Skip ticked
   ones (`[x]`) unless they're not in `fork/TODO.md` or `git log` either (then add them as done
   with the commit you find, or ask). Open every picture the paste refers to.
2. **De-duplicate** against `fork/TODO.md` (open and ticked) and `git log --oneline -300`: an item
   already there isn't added twice; say which ones were already listed or done.
3. **Tag and number** each new item: `[bug] [feat] [lab] [ui] [coop] [infra]` (as many as fit), the
   next free number, one line in the owner's words, tidied:
   `- [ ] 44. [bug][coop] Lobby sits at 0 s with everyone ready · lobby screen · co-op`
   The owner's hints: `· everyone` / `· Lab` answers the scope; `!` = do first (put it at the top
   of "Inbox"); `[?]` = ask before building.
4. **Flag** lines that are cut off mid-sentence or ambiguous with `[?]` and what's missing.
5. **One question batch** (AskUserQuestion), only for the flagged lines. Never ask about shipping,
   pushing or Lab-vs-everyone scope: `CLAUDE.local.md`'s standing decisions answer those (new
   gameplay systems Lab first, settings/UI/display to everyone).
6. Write the answers in, commit `fork/TODO.md` alone and push it (no build needed). Then report
   "N new (numbers), M already listed, K done" in two lines.
7. Building the items is a separate step: claim each one in the file before starting it.

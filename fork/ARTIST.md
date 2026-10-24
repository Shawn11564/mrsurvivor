# Asset Admin: a guide for the artist

The Asset Admin is a page that runs on your own computer. With it you can see every image the
game uses, download any of them, upload new versions and publish them to players. It also has
the radiant importer and the Radiant Sprite Kit.

Only people with **write access to the GitHub repo** can publish. Anyone can download the code,
because the repo is public, but GitHub refuses a publish from any other account. Nothing on the
website accepts uploads.

## Setup (once)

1. **Accept the invitation.** Shawn invites your GitHub account as a collaborator with **Write**
   access. Accept it from the email or from <https://github.com/Shawn11564/mrsurvivor/invitations>.
2. **Install Node.js**, the LTS version, from <https://nodejs.org>.
3. **Install Git:**
   - Windows: <https://git-scm.com/download/win>. The default options are fine. It includes
     the sign-in window GitHub uses.
   - Mac: open Terminal and run `xcode-select --install`.
4. **Download the game's files.** Open a terminal (Windows: Git Bash; Mac: Terminal), go to the
   folder you want them in, and run:
   ```
   git clone https://github.com/Shawn11564/mrsurvivor.git
   ```
   This makes a `mrsurvivor` folder: about 200 MB on disk, mostly sprites.
5. **Sign in to GitHub** for publishing:
   - Windows: nothing to do now. The first time the tool checks, a GitHub window opens. Sign
     in there.
   - Mac: install the GitHub CLI (<https://cli.github.com>), then run `gh auth login` and
     `gh auth setup-git` once.

## Opening it

Double-click **`Asset Admin.bat`** (Windows; it's in the top folder, and in `fork/` too) or
**`fork/Asset Admin.command`** (Mac) in the
`mrsurvivor` folder. A black window opens; keep it open while you work, and close it when you're
done. The page opens in your browser.

The first thing it does is get the latest version from GitHub. The page stays locked until that's
done, so you always work on what's live and never undo someone else's work. It checks GitHub again
every minute by itself. Each check is listed with ✔ when it's done. If one fails, the page says what
went wrong and has a **Try again** button.

If a yellow bar says you can't publish yet, you haven't accepted the invite or signed in.
Do that, then press **Check again**.

## Replacing an image

1. **Find it.** The **Gallery** tab has three groups:
   - **Pokémon:** every Pokémon's sprite sheets, including shiny, radiant, Lab and Mega.
   - **Code icons:** the interface icons, type emblems, move emblems and move badges, which the
     game draws itself.
   - **App icons:** the icons for the home screen.

   Search by name, by number (`150`) or by file name (`Idle`).
2. **Download it.** Each file has a **Download** button. **Download all (.zip)** gets every sheet
   of a Pokémon, and **Download this view** gets everything that's listed. Downloads are named so
   the tool knows where they go back: `pokemon__150__Idle.png`, `code-icon__coin@4x.png`.
3. **Edit it.** Keep the **exact size** for sprite sheets: their frame grid is fixed, and the tool
   refuses a sheet of a different size. A code icon can be its size or a whole multiple: ×2, ×4 and
   so on. The game shows it at the same size, and a bigger one stays sharp on big screens.
   A held item's icon (Leftovers, Choice Band...) can also be a size of its own, up to twice the
   code icon's: the game fits it into the space the old icon took, so it doesn't come out bigger.
4. **Upload it.** There are three ways:
   - Drop the image onto its file, or use **Upload new version…** on that file. Any name works:
     it's renamed to the right one. A JPG, WebP, GIF or BMP is turned into a PNG. A JPG has no
     transparency, so check the edges.
   - Drop many files, a folder or a .zip anywhere on the gallery. Each one goes to the file with
     its name, so keep the download names.
   - The **Upload files…** button does the same.

   Each upload is checked. The page shows the old and new versions side by side and lists any
   upload it refused, with the reason.
5. **Apply.** **Apply to the game files** at the bottom puts the new versions into your copy of
   the game. Nothing is live yet.
6. **Publish.** **Publish to players** sends them to GitHub, and players get them a minute or two
   later. If Shawn published something in the meantime, the tool merges it in first by itself.
   GitHub shows the change under your GitHub account. You don't need to set a name or email in Git.

Changed your mind? Before applying, use **Discard**. After applying and before publishing, open
**Show changed files** and use **Undo**. A code icon can go back to the game's own drawing with
**Back to the code drawing**.

## Radiants

The **Sprite Kit** tab downloads a Pokémon's sheets laid out for recolouring. The **Radiants** tab
imports the finished zips and sets each radiant's rarity. Publish from the bar at the bottom, the
same as the gallery. Radiant zips go in the Radiants tab, not the gallery: the gallery refuses
them, so a radiant can't replace a normal sprite by mistake.

## Requests: ask Claude, or ask for a change

Inside the game itself (not the Asset Admin) there's a **Requests** board just for you and Shawn.
Sign in to the game with your Mello account and press **REQUESTS** at the bottom left.

- **+ New request**: pick **Change request** or **Question**, write what you need, and send.
  Say where it is in the game and what you expect to see. Pictures help: paste a screenshot
  straight into the text box, drop one on it, or use **Add picture** (up to 3; they're shrunk to fit).
- **Claude answers in the thread.** Shawn's PC runs a Claude session that checks the board every
  few minutes while it's on, so replies can take a while when it's off.
- **Status**: *New* (waiting for Claude), *Working on it*, *Waiting on you* (Claude asked
  something: just reply, and it goes back to New), *Done*, *Closed*.
- **A change** is made, tested and published by Claude, and the reply links the commit. Players
  (you too) get it by themselves a few minutes later, the next time the game is in a menu.
- A pink dot and the number on the button mean a thread has a new reply. **Close request** closes
  one of yours that you no longer need. Ctrl+Enter sends.

## If something goes wrong

- **"These files were changed here AND on GitHub"**: someone published a new version of a file
  you'd also changed. Press **Undo my changes to these files** and the tool continues with
  theirs. Then redo yours on top if you still want it.
- **"Port 8130 is busy"**: the tool is already open in another window.
- **"Couldn't reach GitHub"**: check the internet connection and press **Try again**.
- Anything else: send Shawn a screenshot of the page and of the black window.

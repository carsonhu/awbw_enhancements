# Chrome Web Store Distribution

Chrome only installs packaged extensions from the Chrome Web Store, so the store is the only way to give Chrome users a
one-click install that updates by itself. The extension is listed as **Unlisted**: anyone with the link can install it,
but it doesn't show up in store search (so it doesn't compete with kbuzsaki's original listing). Switching it to
Public later is one setting.

Edge, Brave, Opera and Vivaldi users can install from the Chrome Web Store too.

## One-time setup

1. Register as a Chrome Web Store developer at <https://chrome.google.com/webstore/devconsole> (one-time US$5 fee).
   Verify the contact email it asks for; you can't publish until it's verified.
2. Run `./manage.ps1 pack-chrome`. It builds `dist/awbw_enhancements_chrome.zip`, with `manifest.json` at the zip's root.
3. In the developer dashboard click **New item** and upload that zip.
4. Fill in the tabs as below, then **Submit for review**. A review usually takes from a day to a few days.
5. Once it's published, put the store link in the README's Chrome section (see "README" below).

### Store listing tab

- **Description** (the summary line comes from the manifest's `description`):

  > A fork of kbuzsaki's AWBW Enhancements for Advance Wars By Web (awbw.amarriner.com). It isn't made by or
  > affiliated with AWBW or the original author.
  >
  > • Quick action hotkeys in the move planner: move, wait, capture, set HP, build units, end turn (all customizable)
  > • Undo (Ctrl+Z) and a tree of saved snapshots you can branch, download and load
  > • Multi-hit KO calculator: chance to destroy a unit over several attacks, with luck carried forward
  > • Open the move planner in a panel over a game or replay (O), showing the board where the replay is
  > • Weather toggle, automatic repairs, and support for AWBW's new CO versions
  > • The original's replay keyboard shortcuts, movement range previews, player panels and move planner bug fixes
  >
  > Disable the original AWBW Enhancements first if you have it installed.
  >
  > Source code and bug reports: https://github.com/carsonhu/awbw_enhancements

- **Category:** the closest games or entertainment category the dashboard offers.
- **Language:** English.
- **Store icon:** `res/images/fighter_icon128.png`.
- **Screenshots** (1280×800, up to 5, in this order):
  1. `docs/images/store/store_multihit_calculator.png`
  2. `docs/images/store/store_move_planner.png`
  3. `docs/images/demo_screenshot_1.png` to `demo_screenshot_3.png` (from the original extension's listing)

  The two store images are built from `docs/images/multihit_calculator.png` and
  `docs/images/move_planner_snapshots.png`, with a title and feature list beside each screenshot.
- **Homepage / support URL:** `https://github.com/carsonhu/awbw_enhancements`.

### Privacy tab

- **Single purpose:** "Adds keyboard shortcuts, a multi-hit damage calculator and move planner improvements to the
  Advance Wars By Web website."
- **Permission justifications:**
  - `storage`: "Saves the user's extension options and move planner snapshots."
  - `downloads`: "Optionally renames replay files downloaded from Advance Wars By Web to include the map and players.
    Off by default; other downloads are left alone."
  - Host permission `https://awbw.amarriner.com/*`: "The extension only works on Advance Wars By Web. It runs on its
    game, replay, move planner and damage chart pages, and loads game data from the site for the move planner panel
    and replay renaming."
- **Remote code:** "No, I am not using remote code." All scripts are in the package; the `res/*.js` files the extension
  injects into AWBW pages are loaded from the extension itself (`chrome.runtime.getURL`).
- **Data usage:** check none of the data types, and certify the three disclosures (no selling, no unrelated use, no
  creditworthiness use).
- **Privacy policy URL:** `https://github.com/carsonhu/awbw_enhancements/blob/main/PRIVACY.md`.

### Distribution tab

- **Visibility:** Unlisted.
- **Regions:** all regions.

## Each release

1. Bump `version` in `manifests/manifest_common.json`. The store only accepts a higher version than the published one
   (up to four numbers, each at most 65535; `2026.10.29.2` works).
2. Run `./manage.ps1 pack-chrome`.
3. In the dashboard, open the item → **Package** → **Upload new package**, upload `dist/awbw_enhancements_chrome.zip`,
   and submit for review. Installed copies update by themselves within a few hours of it being published.
4. Attach the same zip to the GitHub release (keep the name `awbw_enhancements_chrome.zip`: the README links to it),
   alongside the Firefox files from [DISTRIBUTION.md](DISTRIBUTION.md).

If you add a permission or host permission, Chrome disables the extension for existing users until they accept it, so
avoid adding them casually.

## README

Once the listing is live, replace the first line of the README's "Chrome / Edge / Brave" section with:

```markdown
1. **Open** [AWBW Enhancements Plus on the Chrome Web Store](https://chromewebstore.google.com/detail/<item-id>) and click **Add to Chrome**.

That's it. Chrome keeps it up to date by itself.
```

and keep the zip steps below it as the "without the Web Store" route.

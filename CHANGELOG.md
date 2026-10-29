# Changelog

This fork, **AWBW Enhancements Plus**, is based on [AWBW Enhancements](https://github.com/kbuzsaki/awbw_enhancements)
by [kbuzsaki](https://github.com/kbuzsaki). It branches from the original's last release, **2024.5.22.0**
(commit `3ed3507`, which added Azure Asteroid support). Everything below is a change made in this fork; nothing in the
original was taken out except where listed under **Removed**.

## Differences from the original at a glance

| Area | Original (2024.5.22.0) | This fork |
| --- | --- | --- |
| Move planner hotkeys | Range preview keys only | Quick move, build, capture, wait/unwait, remove, convert property, set HP, end turn; all rebindable from an in-game Hotkeys window |
| Snapshots | A flat list of quick saves | A branching tree with a visual view, plus Save Tree / Load Tree to a file (the list is still available) |
| Undo | — | Undo button and Ctrl+Z in the move planner, back through the last 100 changes |
| Damage calculator | AWBW's calculator, plus a key to toggle it | A multi-hit KO calculator mode (K) next to AWBW's own calculator |
| Planning from a game or replay | The Move Planner button opens a new tab | A move planner panel (O) over the game, showing the replay part way through a turn |
| Turn start in the planner | Income only | Income, then repairs the way AWBW does them |
| Weather | Taken from the game | Clear / Rain / Snow toggle in the planner |
| Armies and CO portraits | Up to Azure Asteroid; portraits broken after AWBW moved them | Noir Eclipse, Silver Claw, Umber Wilds; portraits fixed, with a fallback for every style |
| CO versions | — | The 2026 versions of COs (Clone Andy, AW1 Drake, DS Sonja, ...): portraits, powers and damage |
| Requests to AWBW | Settings page fetched on every planner load | Settings fetched at most once a day; replay panel reads the page instead of refetching |
| Other userscripts | — | Works alongside AWBW Advanced Hotkeys |
| Browsers | Chrome and Firefox (store builds) | Chrome loaded unpacked from this repository; Firefox from a zip on the Releases page |

## 2026-10-29 (2026.10.29.1)

### Changed
- The move planner's **Undo** button is now next to **Hotkeys** at the top, so the snapshot buttons start with
  Snapshot again, as before Undo was added.

### Fixed
- **Multi-hit calculator: DS Olaf in DS snow.** It no longer gives DS Olaf +20% attack in DS snow, which AWBW doesn't
  do. Checked against game 1751335 (DS Olaf vs DS Jess): all 20 attacks in DS snow, on the turn of his Winter Fury and
  Jess's turn after it, match DS Olaf's units at their usual attack, and 4 of them couldn't have happened with +20%.
  AWBW's own calculator already left it out, so the two calculators agree again.

## 2026-10-29 (2026.10.29.0)

### Changed
- **Easier Firefox install.** Each release on GitHub has `awbw_enhancements_ff.zip`, which Firefox loads as is from
  about:debugging: no extracting or renaming manifests. `./manage.ps1 pack-ff` builds the same zip, and now puts the
  Chrome manifest back afterwards so the folder still loads in Chrome.
- The extension's version is now 2026.10.29.0 (it had stayed at 2025.5.22.0).

## 2026-10-19

### Added
- **The new versions of COs.** AWBW now has versions of some COs with different stats and powers, only on some maps
  (each map allows specific versions): Clone Andy (RBC), Drake (AW1), Max (AW1), Olaf (AW1), Sturm (AW1 Campaign),
  Jess (DS), Olaf (DS), Kanbei (DS) and Sonja (DS). In a game with one:
  - The multi-hit calculator uses the version's damage. Checked against AWBW's own calculator in 29 matchups from
    games with Clone Andy, AW1 Drake, DS Jess, DS Olaf and DS Sonja, all matching: DS Sonja's -5% to +9% luck, the
    terrain star she takes from her targets (on her counterattacks too, three with her SCOP and still one with her
    COP) and her counters without the 1.5x boost; DS Jess's 120 / 140 / 160% vehicles and 100% foot soldiers; and AW1
    Drake's naval units adding two terrain stars to their terrain's (5 in a port). AW1 Drake's air units are still
    -30%, as in AWBW's calculator, though his CO card says -20%. DS Kanbei (120/120, +30% attack with his powers, +30%
    defense and double-damage counters with his SCOP), AW1 Campaign Sturm (130/80, +10% more with his SCOP) and DS
    Olaf's +20% attack in DS snow follow their CO cards, since no game to check them was available; AW1 Max (150%
    direct units, +27% with his COP) isn't on any map yet and follows AWBW's announcement.
  - The version's portrait is shown in AWBW's calculator, the multi-hit calculator and the move planner's player
    panels, and the move planner's power bars have the version's stars. A power the version doesn't have (Clone
    Andy's SCOP, for example) has no button, in the player panels or the multi-hit calculator.
  - In the move planner, snow in a game with DS Olaf is DS snow: it doesn't slow units down, and rain doesn't slow
    Olaf's units, as on AWBW.

  AWBW only shows which version a player has on the game page (by the portrait), so the extension saves it there for
  the move planner, without any requests to AWBW. A move planner opened without visiting the game page first still
  finds the AW1 versions and DS Olaf from the planner page, but not DS Jess, Kanbei or Sonja.

## 2026-10-18

### Added
- **Undo in the move planner.** An **Undo** button at the start of the snapshot buttons, and **Ctrl+Z**, take back the
  last change to the board, one change at a time (up to 100): moves, waits, builds, captures, HP, removed units, end
  turn, restored snapshots, and the funds and CO powers in the player panels. Pressed while a unit is following the
  cursor, it cancels the move. Works in the move planner panel too, where loading a new board from the replay starts
  the undo history over. Undo records the board the same way snapshots do, in the page, so it makes no requests to
  AWBW.

### Changed
- Restoring a snapshot (or undoing) on a board with fog asks AWBW's server for the fog image once per page, not on
  every restore.
- Snapshots no longer leave a link holding a copy of the board in the page each time one is taken.

### Fixed
- **Multi-hit calculator: Kanbei's and Sonja's counterattacks.** Their 1.5x counter now applies only to the CO's
  day-to-day attack, with power and com tower bonuses added on top, the way AWBW does it. Kanbei's SCOP counters were
  about 5% too strong (for example 100 - 107% where AWBW's calculator says 95 - 103%). Checked against AWBW's own
  calculator for 83 matchups covering every CO, including Nell, Rachel, Flak, Jugger and Sonja luck at each power
  level, and Kanbei's and Sonja's counters with powers and com towers; everything else already matched.
- **Multi-hit calculator: Sonja's Counter Break.** Under her SCOP, Sonja's units strike first but without her 1.5x
  counter boost. Before, the calculator kept the boost, so for example a 5.6 HP Mega Tank attacking her 7.3 HP Mega
  Tank was always destroyed; in a test game it survived at 2 HP, which only the unboosted first strike can produce.
  (AWBW's own calculator doesn't show Counter Break at all: it gives her SCOP the same answer as her COP.)

## 2026-10-17

### Changed
- The move planner panel's default key is now **O** instead of P. P is Pause in both of AWBW Advanced Hotkeys' default
  presets; O isn't used by either.

## 2026-10-16

### Added
- **Multi-hit KO calculator.** A second mode for the damage calculator, in games and the move planner. It chains
  several attacks against one defender and shows, after each attack, the chance the defender is destroyed and its HP
  distribution, with the luck of earlier attacks carried forward. It also shows each attack's damage range, funds
  damage, and the counterattack each attacker takes, including the counter at each HP the defender can be left at
  (for example, "Counter @2HP 7 - 8% @3HP 10 - 12%"). The damage math is based on kilmefirst's multi-hit KO
  calculator spreadsheet.
  - Switch with **K** or the **Multi-hit** / **Simple** buttons in the title bar. The window keeps the regular
    calculator's position and width, and the first attack and the defender are laid out exactly like the regular
    calculator.
  - Hold **Shift+A** and click units to add attacks (this also works from the regular calculator). **A** and **D** set
    the first attack and the defender, as they do in the regular calculator, including through other scripts' hotkeys.
  - The defender's HP can be a range, such as `4.1-5`, when you don't know it exactly.
  - Each attack has an "HP change before" field for mid-turn power damage such as Kindle's Urban Blight. Sonja's
    Counter Break, which strikes back before the attack, gets its own line.
  - Can be turned off in the options.
- **Move planner panel.** Press the panel key or click **Plan here** beside the Move Planner button to open the move
  planner in a panel over a game or replay, instead of in a new tab.
  - In a replay, it shows the board as the replay is showing it, part way through the turn: unit positions, HP and
    waited state, captures, funds and CO powers. In a game, it shows the game as it is now.
  - It follows the replay or game: reopen it after stepping through the replay and it shows where you are now.
    **Load from here** / **Reload game** starts over after you've tried a line.
  - Following a replay within a turn needs no requests to AWBW; moving to another turn loads one planner page.
  - The planner is stripped down to fit the panel, and the arrow keys scroll it instead of changing the turn.
  - Limitations: in fog it shows every unit, including those hidden by fog, and units loaded in transports aren't
    shown.
  - The panel and its key can be turned off or changed in the options.
- **AWBW Advanced Hotkeys compatibility.** On the game page, a key that the
  [AWBW Advanced Hotkeys](https://greasyfork.org/scripts/557553) userscript also uses is left to it: the panel key,
  the multi-hit key, and Shift+A outside the multi-hit calculator (its CO Power key by default). The options page
  warns about these clashes, using the bindings last seen on a game page. In the panel, the userscript's Close
  Movement Planner key closes it.

### Changed
- **Move planner hotkeys drive AWBW's menus directly instead of waiting on timers.** AWBW opens its menus
  synchronously, so a hotkey now opens the menu for the unit or building under the cursor and picks the option in the
  same step. The target is found when the key is pressed, looking past HP badges. Ctrl, Alt and Cmd shortcuts no
  longer trigger hotkeys.
- **Quick move** tracks whether a unit is being moved: press the key again, or release it after dragging at any speed,
  to drop the unit.
- **Turn-start repairs follow AWBW** (checked against replays): oldest units first, with units built in the planner
  after the game's own. A unit is only repaired if its full repair is affordable, never by 1 HP; otherwise it's skipped
  and the rest carry on. The player's power ends before income and repairs, so Hachi no longer gets half-price
  repairs, and costs are whole numbers. A unit is only charged if its HP was actually set.
- **Hotkeys window:** shows key names (",", "F5") instead of raw characters, Esc cancels an edit, and keys already in
  use (HP digits, C, the multi-hit key, the range preview keys, the panel key) are refused.
- AWBW's own calculator controls (C, the menu button, or another script's calculator hotkey) always open the regular
  calculator, and switch to it from multi-hit instead of closing.
- The planner no longer fetches AWBW's Settings page on every load. The CO portrait style is saved when you open the
  Settings page, and otherwise fetched at most once a day; a logged-out fetch no longer overwrites it.

### Fixed
- Unit values in the planner's player panels showed "NaNk" and the total skipped every full-HP unit (shown as
  "? + ..."). Full-HP units now count as 10 HP; only units with genuinely hidden HP show "? +".
- Quick convert (V/N) waits for the server's reply to its own request and ignores a stale menu left open elsewhere on
  the map. The menu closes when there's nothing to convert.
- When AWBW still had something selected, a hotkey's click only deselected it, leaving AWBW out of sync and
  swallowing the next click. The hotkey now clicks again.
- The options page no longer clears a key from build hotkeys at other kinds of building, so Q can build at a base, an
  airport and a port again.
- Holding Shift for the move range preview re-parsed the map and rebuilt every player panel on each cursor move. The
  preview no longer triggers those updates.
- When AWBW rate limits `load_replay.php`, the planner retries with a backoff, then falls back to the page's own
  player info, instead of silently losing its player panels, hotkeys and snapshots.
- CO portraits fall back to the AW2 or DS style when the chosen style doesn't have that CO (for example, Dual Strike
  COs in the AW2 style), instead of showing a missing image.
- Decimals and ranges couldn't be typed into the multi-hit calculator's fields, because the game page clears values
  like "9." or "6-" as you type. Its fields now handle their own key events and are only reformatted when they lose
  focus.
- The End Turn button and power bar no longer get cut off or collapse in the sidebar player panel.
- The extension's `axios.post` wrappers now pass through the original's `this` and all of its arguments.

## 2025-11-30

### Added
- **Save Tree / Load Tree:** download the whole snapshot tree to a file and load it again later.

### Fixed
- Quick convert and other menu hotkeys close any stale menu and open the menu for the hovered unit or building first,
  so they act on the right target.

## 2025-11-20 to 2025-11-24: first fork release

### Added
- **Quick action hotkeys in the move planner**, each rebindable:
  - **B** quick move (hold B to drag and drop the unit)
  - **V** / **N** convert a property to your army / to neutral
  - **G** remove a unit
  - **F** capture with Infantry or Mech
  - **S** wait, **X** unwait
  - **1-9, 0** set HP (0 is 10 HP)
  - **M** end turn
- **Quick build hotkeys:** hover over a base, airport or port and press a key to build. By default Q/W/E/R/T build
  Infantry / Recon / Artillery / Tank / Anti-Air at a base, T-Copter / B-Copter / Fighter / Bomber / Stealth at an
  airport, and Black Boat / Lander / Cruiser / Sub / Battleship at a port. Every other unit can be given a key.
- **In-game Hotkeys window** (the wrench button in the planner) that lists every shortcut and lets you rebind keys
  with a click, resolving clashes between general actions and units at the same kind of building.
- A **Disable All Quick Action Hotkeys** button in the options, for anyone who only wants the fixes.
- **Weather toggle** in the planner: Clear, Rain or Snow, which changes movement ranges (and building sprites).
- **Tree-based snapshots** with an SVG view of the branches: compact layout, dark mode, and buttons to delete,
  restore and toggle the tree. Can be switched back to the original list in the options.
- **Automatic repairs at the start of the turn** for units on cities, bases, ports and airports.
- Support for the newer armies: **Noir Eclipse**, **Silver Claw** and **Umber Wilds**, including their bases and ports.
- **Firefox support** from this repository, with a separate `manifest_firefox.json` and a `run-ff` development command
  in `manage.ps1`.

### Changed
- Renamed to **AWBW Enhancements Plus**, version 2025.5.22.0.
- A built `manifest.json` is committed, so the repository can be loaded as an unpacked extension without running
  `make`.
- Amber Blaze is now Amber Blossom, matching AWBW.
- Hachi's units cost half price while her CO Power or Super CO Power is on (90% otherwise), in the planner's funds.
- Quick move detects a click on a tile's corner, using the element under the mouse.

### Fixed
- CO portraits in the move planner were missing after AWBW moved them to `terrain/co-portraits/`. Portraits are
  sized to fit the player panels and CO select panel, and Sturm falls back to the AW2 portrait in the DS style.
- Funds were deducted for a unit that wasn't actually built ("ghost production"). Funds are now only deducted once
  the unit appears on the map, and rapid repeated builds are handled.
- Broken HP icon sprites on pre-deployed full-HP units after restoring a snapshot.
- Units listed under "removed units" are cleared when a state is loaded.
- Quick capture sometimes acted before AWBW's menu was ready.
- Several snapshot box and savestate manager bugs.

### Removed
- The **Toggle Calculator** keyboard shortcut (C by default) and its option. AWBW's own C key opens the calculator
  in both the game page and the planner.

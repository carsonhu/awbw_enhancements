# AWBW Enhancements (Fork)

> **Note:** This is a fork of the original [AWBW Enhancements](https://github.com/kbuzsaki/awbw_enhancements) by [kbuzsaki](https://github.com/kbuzsaki). All credit for the original extension goes to the original author.

"AWBW Enhancements" is a browser extension that adds extra functionality to [Advance Wars By Web](https://awbw.amarriner.com).

## Installation

The original extension can be installed for Chrome and Microsoft Edge (and other Chromium-based browsers) [here](https://chrome.google.com/webstore/detail/awbw-helper/cnkhdcnafdfffpkbbbeghbdjkabhbkfi) and for Firefox [here](https://addons.mozilla.org/en-US/firefox/addon/awbw-enhancements/).

To use this fork, you'll need to load it as an unpacked extension in your browser (Chrome/Edge/Brave/etc):

1. **Download the code:** Clone this repository or download it as a ZIP file and extract it to a folder on your computer.
2. **Open Extensions page:**
    - **Chrome:** Go to `chrome://extensions`
    - **Edge:** Go to `edge://extensions`
3. **Enable Developer Mode:** Toggle the "Developer mode" switch (usually in the top right corner).
4. **Load Unpacked:** Click the "Load unpacked" button that appears.
5. **Select Folder:** Navigate to and select the folder containing the `manifest.json` file (the root folder of this repository).

The extension should now be installed and active.

## Features Added in This Fork

### Quick Action Hotkeys
This fork adds comprehensive keyboard shortcuts for common move planner actions:

- **Quick Move (B)** - Quickly move a unit
- **Quick Convert Army (V)** - Convert building to your army's color
- **Quick Convert Neutral (N)** - Convert building to neutral
- **Quick Remove Unit (G)** - Remove a unit
- **Quick Capture (F)** - Capture with Infantry/Mech
- **Quick Wait (S)** - Wait a unit
- **Quick Unwait (X)** - Unwait a unit
- **Set HP (1-0)** - Set unit HP (1-9 for 1-9 HP, 0 for 10 HP)
- **End Turn (M)** - End your turn

#### Quick Build Hotkeys

Hotkeys to instantly build a unit when hovering over a Base, Airport, or Port. By default, (Q/W/E/R/T) keys are assigned to different units based on the building type:

**Base Units:**
- ![Infantry](https://awbw.amarriner.com/terrain/aw2/osinfantry.gif) **Infantry (Q)** 
- ![Recon](https://awbw.amarriner.com/terrain/aw2/osrecon.gif) **Recon (W)**
- ![Artillery](https://awbw.amarriner.com/terrain/aw2/osartillery.gif) **Artillery (E)**
- ![Tank](https://awbw.amarriner.com/terrain/aw2/ostank.gif) **Tank (R)**
- ![Anti-Air](https://awbw.amarriner.com/terrain/aw2/osanti-air.gif) **Anti-Air (T)**

**Airport Units:**
- ![T-Copter](https://awbw.amarriner.com/terrain/aw2/ost-copter.gif) **T-Copter (Q)**
- ![B-Copter](https://awbw.amarriner.com/terrain/aw2/osb-copter.gif) **B-Copter (W)**
- ![Fighter](https://awbw.amarriner.com/terrain/aw2/osfighter.gif) **Fighter (E)**
- ![Bomber](https://awbw.amarriner.com/terrain/aw2/osbomber.gif) **Bomber (R)**
- ![Stealth](https://awbw.amarriner.com/terrain/aw2/osstealth.gif) **Stealth (T)**

**Port Units:**
- ![Black Boat](https://awbw.amarriner.com/terrain/aw2/osblackboat.gif) **Black Boat (Q)**
- ![Lander](https://awbw.amarriner.com/terrain/aw2/oslander.gif) **Lander (W)**
- ![Cruiser](https://awbw.amarriner.com/terrain/aw2/oscruiser.gif) **Cruiser (E)**
- ![Sub](https://awbw.amarriner.com/terrain/aw2/ossub.gif) **Sub (R)**
- ![Battleship](https://awbw.amarriner.com/terrain/aw2/osbattleship.gif) **Battleship (T)**

**Additional units** (Mech, Md. Tank, Neotank, APC, etc) can have custom hotkeys assigned in the extension options.

All hotkeys are fully customizable in the extension options. A "Disable All Quick Action Hotkeys" button is available in case you only want the bug fixes and CO portrait / army color fixes.

### Weather Toggle
This fork adds a weather toggle to the move planner that allows you to toggle weather between Clear, Rain, and Snow.

### Bug Fixes
- **Fixed CO portraits in move planner** - CO portraits were not being displayed in the move planner.
- **Added in support for new armies** - Extension now works for newly added armies in Advance Wars by Web.
- **Pre-deployed unit HP icons** - Fixed broken HP icon sprites appearing on pre-deployed units with full HP after savestate restore

## Original Features

The original extension includes:

1. Configurable keyboard shortcuts for replays.
2. Several quality of life improvements to the move planner ("Moveplanner Plus"), including:
    1. Movement range previews for the selected unit.
    2. Savestate "quick save" snapshots that let you snapshot and restore states without having to download a full savestate file.
    3. Automatic tracking of unit count, unit value, income, and funds in per-player panels, like on the game screen. This includes automatically deducting funds for unit builds and simulating income for future turns.
    4. Configurable opacity for the "action menu" and "build menu".
    5. Configurable keyboard shortcuts for toggling the damage calculator.
3. Fixes for certain bugs in the vanilla move planner. These include:
    1. The bug where the most recently moved unit sometimes displays as unmoved in the move planner.
    2. The bug where already-moved units sometimes do not unwait with the "Unwait All" button.
    3. The bug where the damage calculator cannot select units that were built on the move planner page.
    4. The visual bug where capture icons are displayed for infantry that have already finished capturing.
    5. The visual bug where black boat sprites break when a savestate is uploaded.

## Screenshots

Here's an example of what the moveplanner looks like with AWBW Enhancements enabled:
![screenshot of moveplanner plus](docs/images/demo_screenshot_2.png)

## Credits

- **Original Author:** [kbuzsaki](https://github.com/kbuzsaki) (saltor#4306 on AWBW Discord)

Please feel free to report bugs or request new features via a GitHub issue.

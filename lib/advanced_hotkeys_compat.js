// Compatibility with the AWBW Advanced Hotkeys userscript (https://greasyfork.org/scripts/557553), which binds most
// keys on the game page and keeps its bindings in the page's localStorage. Where it and the extension share a key,
// the userscript's binding wins: the extension's hotkey does nothing there, and the options page says so.
//
// Loaded as a content script, into the page itself (for res/multihit_calculator.js), and on the options page.

const kAdvancedHotkeysConfigKey = "awbw_hotkeys_config";
// Where the game page saves the userscript's bindings for the options page (chrome.storage.local).
const kAdvancedHotkeysStorageKey = "advanced_hotkeys_bindings";

// Its unit actions only apply while a unit is selected, and its build actions while a build menu is open.
const kAdvancedHotkeysUnitActions = new Set(["fire", "launch", "explode", "capture", "supply", "wait", "repair",
    "load", "unload1", "unload2", "hide", "join", "delete", "deleteConfirm"]);

function isAdvancedHotkeysContextualAction(action) {
    return kAdvancedHotkeysUnitActions.has(action) || action.startsWith("build");
}

// The userscript's bindings ({action: {key, modifier?} or null}), or null when it isn't running. On the game page it
// always adds its settings panel, so bindings left behind after it's uninstalled don't count there.
function advancedHotkeysBindings() {
    if (location.pathname.endsWith("/game.php") && !document.getElementById("awbw-hotkeys-panel")) return null;
    try {
        return JSON.parse(localStorage.getItem(kAdvancedHotkeysConfigKey))?.currentSettings?.hotkeys || null;
    } catch (error) {
        return null;
    }
}

// Same as the userscript's own matching.
function advancedHotkeysBindingMatches(e, binding) {
    if (!binding?.key || !e.key) return false;
    let key = e.key.toLowerCase();
    let bindingKey = binding.key.toLowerCase();
    if (["shift", "ctrl", "alt"].includes(bindingKey) && !binding.modifier) {
        return key === bindingKey || key === { shift: "shift", ctrl: "control", alt: "alt" }[bindingKey];
    }
    if (binding.modifier) {
        let held = (binding.modifier === "ctrl" && e.ctrlKey) || (binding.modifier === "shift" && e.shiftKey)
            || (binding.modifier === "alt" && e.altKey);
        return held && key === bindingKey;
    }
    return key === bindingKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function advancedHotkeysIsShowing(selector) {
    let element = document.querySelector(selector);
    return !!element && window.getComputedStyle(element).display !== "none";
}

// The userscript action that the keydown `e` runs on this page, if any. On the move planner it only has one.
function advancedHotkeysActionFor(e) {
    let bindings = advancedHotkeysBindings();
    if (!bindings) return null;
    if (location.pathname.endsWith("/moveplanner.php")) {
        return advancedHotkeysBindingMatches(e, bindings.closeMovementPlanner) ? "closeMovementPlanner" : null;
    }
    for (let [action, binding] of Object.entries(bindings)) {
        if (!advancedHotkeysBindingMatches(e, binding)) continue;
        if (kAdvancedHotkeysUnitActions.has(action) && !advancedHotkeysIsShowing(".unit-options-game")) continue;
        if (action.startsWith("build") && !advancedHotkeysIsShowing(".build-options-game")) continue;
        return action;
    }
    return null;
}

// The userscript's name for the key with this keyCode, as it stores it.
const kAdvancedHotkeysKeyNames = {
    8: "backspace", 9: "tab", 13: "enter", 16: "shift", 17: "ctrl", 18: "alt", 27: "escape", 32: " ",
    33: "pageup", 34: "pagedown", 35: "end", 36: "home", 37: "arrowleft", 38: "arrowup", 39: "arrowright",
    40: "arrowdown", 45: "insert", 46: "delete", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/",
    192: "`", 219: "[", 220: "\\", 221: "]", 222: "'",
};

function advancedHotkeysKeyName(keyCode) {
    if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 65 && keyCode <= 90)) {
        return String.fromCharCode(keyCode).toLowerCase();
    }
    return kAdvancedHotkeysKeyNames[keyCode] || null;
}

// The game page action that `bindings` give the unmodified key `keyCode`, if any. Unit and build actions aren't
// counted, since they only take the key while their menu is open.
function advancedHotkeysActionForKeyCode(bindings, keyCode) {
    let name = advancedHotkeysKeyName(keyCode);
    if (!bindings || !name) return null;
    for (let [action, binding] of Object.entries(bindings)) {
        if (!binding?.key || binding.modifier || isAdvancedHotkeysContextualAction(action)) continue;
        if (binding.key.toLowerCase() === name) return action;
    }
    return null;
}

// "activatePower" -> "Activate Power"
function advancedHotkeysActionName(action) {
    return action.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

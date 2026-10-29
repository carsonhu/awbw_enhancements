// Multi-hit KO calculator: an alternate mode for AWBW's damage calculator that chains several attacks
// against one defender and reports the odds of destroying it after each attack.
//
// Runs in the page context so it can use AWBW's `calculator` Vue instance (CO/unit/terrain data, sprites,
// and its map unit selection) and `unitsInfo`. Damage math lives in multihit_engine.js.
(function () {
    let options = (() => {
        let firstHash = document.currentScript.src.indexOf("#");
        if (firstHash === -1) return {};
        return JSON.parse(decodeURIComponent(document.currentScript.src.substring(firstHash + 1)));
    })();

    const engine = window.AwbwMultihitEngine;
    // The 2026 versions of COs in play in this game (lib/co_variants.js).
    const coVariants = window.AwbwCoVariants;
    if (!engine || !coVariants) {
        console.log("Multi-hit calculator: damage engine missing! Aborting.");
        return;
    }

    const kStorageKey = "awbwEnhancementsMultihit";
    const kHotkeys = options.options_bindings_multihit_calculator_hotkey || [75 /*k*/];

    const kUnitCosts = {
        "infantry": 1000, "mech": 3000, "recon": 4000, "apc": 5000, "artillery": 6000, "tank": 7000,
        "anti-air": 8000, "missile": 12000, "rocket": 15000, "md.tank": 16000, "piperunner": 20000,
        "neotank": 22000, "megatank": 28000, "t-copter": 5000, "b-copter": 9000, "fighter": 20000,
        "bomber": 22000, "stealth": 24000, "blackbomb": 25000, "blackboat": 7500, "lander": 12000,
        "cruiser": 18000, "sub": 20000, "battleship": 28000, "carrier": 30000,
    };
    const kCoCostMultipliers = { "colin": 0.8, "hachi": 0.9, "kanbei": 1.2 };

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        })[c]);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function formatPercent(probability) {
        if (probability <= 0) return "0%";
        if (probability >= 1) return "100%";
        let percent = probability * 100;
        if (percent < 0.1) return "<0.1%";
        if (percent > 99.9) return ">99.9%";
        return percent.toFixed(1) + "%";
    }

    function formatRange(stat, suffix) {
        if (stat.min === null) return "-";
        let range = stat.min === stat.max ? `${stat.min}${suffix}` : `${stat.min}${suffix} - ${stat.max}${suffix}`;
        return `${range} <span class="awbwe-mh-dim">(avg ${stat.mean.toFixed(1)}${suffix})</span>`;
    }

    function parseNumber(value, fallback) {
        let number = parseFloat(value);
        return isNaN(number) ? fallback : number;
    }

    function waitFor(predicate, callback, timeoutMs) {
        let start = Date.now();
        let timer = setInterval(() => {
            if (predicate()) {
                clearInterval(timer);
                callback();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(timer);
                console.log("Multi-hit calculator: timed out waiting for the damage calculator.");
            }
        }, 200);
    }

    waitFor(() => window.calculator && document.getElementById("calculator") &&
                  calculator.cos?.length && calculator.units?.length && calculator.terrain,
            init, 60000);

    function init() {
        const calcEl = document.getElementById("calculator");

        let state = loadState();
        // Where the next attacker picked from the map goes: replacing pendingReplaceIndex when a [Select] button
        // asked for it, a new attack when [Add from map] did, and otherwise attack 1, like the regular calculator.
        let pendingReplaceIndex = null;
        let pendingAppend = false;
        let drag = null;
        let tileImageCache = {};

        let root = document.createElement("div");
        root.id = "awbwe-multihit";
        root.style.display = "none";
        document.body.appendChild(root);

        let menu = document.createElement("div");
        menu.id = "awbwe-mh-menu";
        menu.style.display = "none";
        document.body.appendChild(menu);

        // ---- State ----

        function freshState() {
            return { mode: "simple", defender: null, attacks: [], position: null, synced: null };
        }

        function loadState() {
            let saved = null;
            try {
                saved = JSON.parse(sessionStorage.getItem(kStorageKey));
            } catch (e) {}
            return Object.assign(freshState(), saved || {});
        }

        function saveState() {
            try {
                sessionStorage.setItem(kStorageKey, JSON.stringify(state));
            } catch (e) {}
        }

        function makeSide(source) {
            let side = clone(source);
            side.hp = side.hp === "?" ? 10 : parseNumber(side.hp, 10);
            side.power = side.power || "N";
            side.hasAmmo = side.hasAmmo !== false;
            side.towers = parseNumber(side.towers, 0);
            side.cities = parseNumber(side.cities, 0);
            side.funds = parseNumber(side.funds, 0);
            return side;
        }

        // `hpUnknown` (e.g. Sonja's hidden HP) starts the defender with a full 0.1 - 10 HP range.
        function makeDefender(source, hpUnknown) {
            let defender = makeSide(source);
            defender.hp = Math.max(0.1, Math.min(10, Math.round(defender.hp * 10) / 10));
            defender.hpMax = null;
            if (hpUnknown) {
                defender.hp = 0.1;
                defender.hpMax = 10;
            }
            return defender;
        }

        function makeAttack(source) {
            let attack = makeSide(source);
            attack.hp = Math.max(1, Math.min(10, Math.ceil(attack.hp)));
            attack.hpChangeBefore = 0;
            attack.enabled = true;
            return attack;
        }

        function sideSignature(side) {
            return JSON.stringify([side?.co?.co_name, side?.unit?.units_name, side?.country?.code, side?.hp,
                                   side?.terrain?.terrain_name, side?.power, side?.towers, side?.hasAmmo,
                                   side?.funds, side?.cities]);
        }

        // The defender and attack 1 mirror the regular calculator's matchup: whichever side changed there since
        // it was last copied over is copied again. Further attacks are kept.
        function syncFromCalculator() {
            let synced = state.synced || {};
            if (!state.defender || synced.defender !== sideSignature(calculator.defender)) {
                state.defender = makeDefender(calculator.defender, calculator.defender.hp === "?");
            }
            if (state.attacks.length === 0) {
                state.attacks.push(makeAttack(calculator.attacker));
            } else if (synced.attacker !== sideSignature(calculator.attacker)) {
                let attack = makeAttack(calculator.attacker);
                attack.hpChangeBefore = state.attacks[0].hpChangeBefore;
                state.attacks[0] = attack;
            }
            rememberSynced();
        }

        function rememberSynced() {
            state.synced = { attacker: sideSignature(calculator.attacker), defender: sideSignature(calculator.defender) };
        }

        function toEngineSide(side) {
            return {
                co: side.co?.co_name, power: side.power, towers: side.towers, funds: side.funds, cities: side.cities,
                unit: side.unit?.units_name, hp: side.hp, hasAmmo: side.hasAmmo,
                terrain: { name: side.terrain?.terrain_name, defense: side.terrain?.terrain_defense },
                coVariant: coVariants.variantForCo(side.co?.co_name), dsSnow: isDsSnow(),
            };
        }

        // Whether it's DS snow (DS Olaf's +20% attack). The game page has the weather in gameWeather, the move planner
        // in weatherCode, and its Clear / Rain / Snow buttons put the one picked on <html data-awbwe-weather>.
        // Snow is DS snow in a game with GAME_FLAGS__JJ__DS_OLAF; codes 1 and 2 are DS snow's days left.
        function isDsSnow() {
            let dsOlafGame = Boolean(Number(window.GAME_FLAGS__JJ__DS_OLAF));
            let picked = document.documentElement.dataset.awbweWeather;
            if (picked) return picked === "snow" && dsOlafGame;
            let code = typeof gameWeather !== "undefined" ? gameWeather?.code
                : typeof weatherCode !== "undefined" ? weatherCode : "C";
            return code === "1" || code === "2" || (code === "S" && dsOlafGame);
        }

        // ---- Visibility and mode switching ----

        function isMultiVisible() {
            return state.mode === "multi" && calculator.toggled;
        }

        function getCalculatorPosition() {
            let style = window.getComputedStyle(calcEl);
            return { x: parseInt(style.left) || 200, y: parseInt(style.top) || 200 };
        }

        // Where the regular calculator is on the page, or null while it's hidden. Measured rather than read from
        // its style, since its left/top aren't necessarily page coordinates.
        function calculatorPagePosition() {
            let rect = calcEl.getBoundingClientRect();
            if (!rect.width && !rect.height) return null;
            return { x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY) };
        }

        // Moves the regular calculator so its top left corner lands on `position` (page coordinates).
        function moveCalculatorTo(position) {
            let current = calculatorPagePosition();
            if (!current) return;
            let style = getCalculatorPosition();
            setCalculatorPosition({ x: style.x + position.x - current.x, y: style.y + position.y - current.y });
        }

        function setCalculatorPosition(position) {
            calcEl.style.left = position.x + "px";
            calcEl.style.top = position.y + "px";
            calculator.windowPosition.x = position.x;
            calculator.windowPosition.y = position.y;
            calculator.storeCalcInfo("windowPosition", calculator.windowPosition);
        }

        function updateVisibility() {
            let visible = isMultiVisible();
            document.body.classList.toggle("awbwe-mh-active", visible);
            root.style.display = visible ? "block" : "none";
            if (!visible) {
                closeMenu();
            }
        }

        // What this calculator last set AWBW's calculator's `toggled` to, until its watcher sees it. Any other change
        // comes from the regular calculator's controls: AWBW's own hotkey and menu button, or another script's.
        let ownToggle = null;

        function setToggled(toggled) {
            if (calculator.toggled !== toggled) {
                ownToggle = toggled;
                calculator.toggled = toggled;
            }
            calculator.storeCalcInfo("toggled", toggled);
        }

        function openCalculator() {
            if (!sessionStorage.calculator) {
                sessionStorage.calculator = JSON.stringify({});
            }
            setToggled(true);
        }

        function closeCalculator() {
            setToggled(false);
        }

        function showMulti() {
            if (state.mode !== "multi") {
                state.position = calculatorPagePosition() || state.position || getCalculatorPosition();
                // Same width as the regular calculator, so switching doesn't resize the window.
                let width = calcEl.getBoundingClientRect().width;
                if (width) state.width = Math.round(width);
            }
            state.mode = "multi";
            syncFromCalculator();
            saveState();
            openCalculator();
            render();
            updateVisibility();
        }

        function showSimple() {
            state.mode = "simple";
            saveState();
            openCalculator();
            updateVisibility();
            let position = state.position;
            if (position) {
                // If AWBW's calculator was closed, it can only be measured once it's shown again.
                if (calculatorPagePosition()) {
                    moveCalculatorTo(position);
                } else {
                    calculator.$nextTick(() => moveCalculatorTo(position));
                }
            }
        }

        function toggleFromHotkey() {
            if (isMultiVisible()) {
                closeCalculator();
            } else {
                showMulti();
            }
        }

        calculator.$watch("toggled", (toggled) => {
            let own = ownToggle === toggled;
            ownToggle = null;
            // The regular calculator's controls are for the regular calculator: they open that one, and while the
            // multi-hit one is open they switch to the regular one instead of closing it.
            if (!own && state.mode === "multi") {
                showSimple();
                addSwitchButton();
                return;
            }
            if (calculator.toggled && state.mode === "multi") {
                syncFromCalculator();
                saveState();
                render();
            }
            updateVisibility();
            addSwitchButton();
        });

        // The game page's move planner panel starts the calculators over each time it's opened (see
        // res/calculator_reset.js, which closes the regular calculator): this one goes back to how it starts, where
        // it is.
        document.addEventListener("awbwe-calculator-reset", () => {
            state = Object.assign(freshState(), { position: state.position, width: state.width });
            pendingReplaceIndex = null;
            pendingAppend = false;
            saveState();
            updateVisibility();
        });

        // A "Multi-hit" button in the regular calculator's header.
        function addSwitchButton() {
            let header = calcEl.querySelector("header.grab-header");
            if (!header || header.querySelector(".awbwe-mh-switch")) return;
            let button = document.createElement("span");
            button.className = "awbwe-mh-switch";
            button.textContent = "Multi-hit";
            button.title = `Switch to the multi-hit KO calculator${hotkeyHint()}`;
            button.addEventListener("mousedown", (e) => e.stopPropagation());
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                showMulti();
            });
            header.appendChild(button);
        }

        function hotkeyHint() {
            if (!kHotkeys.length) return "";
            return ` (hotkey: ${kHotkeys.map((code) => String.fromCharCode(code)).join(" / ")})`;
        }

        const kHelpText = [
            "Defender HP: type a range like 4.1-5 (or click the heart) when you don't know the exact HP",
            "A / D: set the attacker (attack 1) / defender, as with the regular calculator",
            "Hold Shift+A and click units: add attacks (also works from the regular calculator)",
        ].concat(kHotkeys.length ? [`Open / close: ${kHotkeys.map((code) => String.fromCharCode(code)).join(" / ")}`] : [])
         .join("\n");

        // ---- Map unit selection ----

        // AWBW's calculator fills its attacker/defender from map picks: its [Select] buttons, holding A/D and
        // clicking, and other scripts' hotkeys (such as AWBW Advanced Hotkeys picking the unit under the cursor).
        // While the multi-hit calculator is open, those picks go to it instead.
        const originalAddUnitToCalc = calculator.addUnitToCalc;
        calculator.addUnitToCalc = function (position, id) {
            if (!isMultiVisible()) return originalAddUnitToCalc.apply(this, arguments);
            let previous = Object.assign({}, calculator[position]);
            let result = originalAddUnitToCalc.apply(this, arguments);
            handleMapSelection(position, id, previous);
            return result;
        };

        // `previous` is the regular calculator's side before the pick. Only picks for the defender or attack 1
        // stay there, so that switching back to it shows the same matchup.
        function handleMapSelection(position, id, previous) {
            let source = clone(calculator[position]);
            // unitsInfo has the unit's exact HP (e.g. 6.3), which matters for the defender.
            let rawHp = window.unitsInfo?.[id]?.units_hit_points;
            let hpUnknown = rawHp === "?" || source.hp === "?";
            if (!isNaN(parseFloat(rawHp))) {
                source.hp = parseFloat(rawHp);
            }
            if (position === "defender") {
                state.defender = makeDefender(source, hpUnknown);
            } else {
                let attack = makeAttack(source);
                let appending = pendingAppend || held?.append;
                let index = pendingReplaceIndex ?? (appending ? null : 0);
                if (index !== null && state.attacks[index]) {
                    attack.hpChangeBefore = state.attacks[index].hpChangeBefore;
                    attack.enabled = state.attacks[index].enabled;
                    state.attacks[index] = attack;
                } else {
                    state.attacks.push(attack);
                    index = state.attacks.length - 1;
                }
                if (index !== 0) {
                    Object.assign(calculator.attacker, previous);
                }
            }
            rememberSynced();
            pendingReplaceIndex = null;
            pendingAppend = false;
            saveState();
            render();
            rearmHeldSelection();
        }

        // `target` is an attack's index to replace it, or "append" to add an attack.
        function selectFromMap(position, target) {
            pendingReplaceIndex = typeof target === "number" ? target : null;
            pendingAppend = target === "append";
            // selectUnit() toggles, so cancel any selection that's already in progress first.
            if (calculator.selectorPosition) {
                calculator.selectUnit(calculator.selectorPosition);
            }
            calculator.selectUnit(position);
            render();
        }

        // ---- A / D / Shift+A selection hotkeys ----

        // Plain A and D are left to AWBW (hold and click a unit) or to other scripts' hotkeys; their picks arrive
        // through addUnitToCalc above, setting attack 1 or the defender. Shift+A is this calculator's own: hold it
        // and click units to add attacks, several while the keys are held.
        let held = null;  // {key, append}
        let hiddenFireOptions = [];

        function mapElement() {
            return typeof gamemap !== "undefined" ? gamemap : document.getElementById("gamemap");
        }

        function startHeldSelection() {
            if (calculator.selectorPosition) {
                calculator.selectUnit(calculator.selectorPosition);
            }
            // Same as AWBW: drop any in-progress unit move, and hide the attack target icons while selecting.
            if (typeof moving !== "undefined" && moving && typeof resetCreatedTiles === "function") {
                resetCreatedTiles("span[class$='tile'], span[class$='square'], .action-square");
                resetUnit();
            }
            hiddenFireOptions = Array.from(document.querySelectorAll(".fire-option"));
            hiddenFireOptions.forEach((option) => option.style.display = "none");

            pendingReplaceIndex = null;
            calculator.shortcutPressed = held.key;
            calculator.selectorPosition = held.key === "d" ? "defender" : "attacker";
            calculator.selectState("#DDDDDD", "black", "grab");
            mapElement()?.addEventListener("click", calculator.fetchUnitId);
        }

        function endHeldSelection(key) {
            hiddenFireOptions.forEach((option) => option.style.display = "block");
            hiddenFireOptions = [];
            // A completed pick has already cleaned up after itself.
            if (calculator.shortcutPressed !== key) return;
            calculator.selectState("", "white", "auto");
            mapElement()?.removeEventListener("click", calculator.fetchUnitId);
            calculator.selectorPosition = null;
            calculator.shortcutPressed = "";
        }

        // AWBW ends the selection after one pick; keep going while Shift+A is still held.
        function rearmHeldSelection() {
            if (!held?.append) return;
            setTimeout(() => {
                if (held?.append && !calculator.selectorPosition) startHeldSelection();
            }, 0);
        }

        function isOwnTextInput(element) {
            return element && root.contains(element) && element.tagName === "INPUT" && element.type === "text";
        }

        function isSelectionHotkey(e) {
            return !e.ctrlKey && !e.altKey && !e.metaKey && /^[ad]$/i.test(e.key || "");
        }

        window.addEventListener("keydown", (e) => {
            if (!isSelectionHotkey(e)) return;
            let target = e.target;
            let typing = target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
            if (typing && !isOwnTextInput(target)) return;
            // Letters are never valid in this calculator's number fields, so treat them as hotkeys there too:
            // AWBW's shortcuts ignore keys while a field has focus, so the field gives it up first.
            if (isMultiVisible() && isOwnTextInput(document.activeElement)) {
                document.activeElement.blur();
            }
            if (!(e.key.toLowerCase() === "a" && e.shiftKey)) return;
            // AWBW Advanced Hotkeys uses Shift+A for the CO Power by default; outside the multi-hit calculator, it
            // keeps whatever it uses Shift+A for.
            if (!isMultiVisible() && !held && advancedHotkeysActionFor(e)) return;

            // Shift+A also works outside the multi-hit calculator: it switches over, keeping the current matchup.
            e.preventDefault();
            e.stopPropagation();
            if (held) return;
            if (!isMultiVisible()) {
                showMulti();
            }
            held = { key: "a", append: true };
            startHeldSelection();
        }, true);

        window.addEventListener("keyup", (e) => {
            if (!held || (e.key || "").toLowerCase() !== held.key) return;
            e.preventDefault();
            e.stopPropagation();
            let key = held.key;
            held = null;
            endHeldSelection(key);
        }, true);

        window.addEventListener("blur", () => {
            if (!held) return;
            let key = held.key;
            held = null;
            endHeldSelection(key);
        });

        // ---- Pickers ----

        function closeMenu() {
            menu.style.display = "none";
            menu.innerHTML = "";
        }

        function openMenu(anchor, items, onPick, className) {
            menu.className = className || "";
            menu.innerHTML = items.map((item, i) =>
                `<img src="${esc(item.src)}" title="${esc(item.title)}" data-index="${i}" draggable="false">`).join("");
            menu.querySelectorAll("img").forEach((img) => {
                img.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onPick(items[parseInt(img.dataset.index)]);
                    closeMenu();
                });
            });
            let rect = anchor.getBoundingClientRect();
            menu.style.left = (rect.left + window.scrollX) + "px";
            menu.style.top = (rect.bottom + window.scrollY + 2) + "px";
            menu.style.display = "flex";
        }

        document.addEventListener("mousedown", (e) => {
            if (menu.style.display !== "none" && !menu.contains(e.target)) {
                closeMenu();
            }
        });

        function coImage(co) {
            let variant = coVariants.variantForCo(co?.co_name);
            return variant ? coVariants.variantPortraitUrl(variant) : calculator.getCOImage(co);
        }

        function coTitle(co) {
            return coVariants.displayName(co?.co_name);
        }

        // Hides a power star the side's CO doesn't have in this game (e.g. Clone Andy's SCOP).
        function powerStyle(side, power) {
            return coVariants.canUsePower(side.co?.co_name, power) ? "" : ` style="visibility: hidden"`;
        }

        function unitImage(side) {
            return calculator.terrainPath + side.country.code + side.unit.units_name.toLowerCase() + ".gif";
        }

        function tileImage(terrain) {
            let name = terrain?.terrain_name || "Plain";
            if (!tileImageCache[name]) {
                try {
                    tileImageCache[name] = calculator.tileImage(name);
                } catch (e) {
                    tileImageCache[name] = "";
                }
            }
            return tileImageCache[name];
        }

        function terrainList() {
            return Object.values(calculator.terrain || {});
        }

        function pickCo(anchor, side) {
            openMenu(anchor, calculator.cos.map((co) => ({ src: coImage(co), title: coTitle(co), value: co })),
                     (item) => {
                         side.co = { co_name: item.value.co_name, co_id: item.value.co_id };
                         changed(true);
                     }, "awbwe-mh-co-menu");
        }

        function pickUnit(anchor, side) {
            openMenu(anchor, calculator.units.map((unit) => ({
                src: calculator.terrainPath + side.country.code + unit.units_name.toLowerCase() + ".gif",
                title: unit.units_name, value: unit,
            })), (item) => {
                side.unit = { units_name: item.value.units_name, units_id: item.value.units_id };
                side.hasAmmo = true;
                changed(true);
            }, "awbwe-mh-unit-menu");
        }

        function pickTerrain(anchor, side) {
            openMenu(anchor, terrainList().map((terrain) => ({
                src: tileImage(terrain), title: terrain.terrain_name, value: terrain,
            })), (item) => {
                side.terrain = clone(item.value);
                changed(true);
            }, "awbwe-mh-terrain-menu");
        }

        // ---- Rendering ----

        function stars(side) {
            let defense = parseNumber(side.terrain?.terrain_defense, 0);
            let isLashScop = engine.normalizeCoName(side.co?.co_name) === "lash" && side.power === "S";
            return isLashScop ? defense * 2 : defense;
        }

        // `className` is "hp-display" inside the regular calculator's markup.
        function hpOverlay(hp, className = "awbwe-mh-hp-overlay") {
            let display = Math.ceil(hp);
            if (display >= 10 || display <= 0) return "";
            return `<img class="${className}" src="terrain/aw2/${display}.gif" draggable="false">`;
        }

        function usesAmmo(side) {
            return !engine.kUnitsWithoutAmmo.has(engine.normalizeUnitName(side.unit.units_name));
        }

        // One side's controls, as pieces that are laid out as a row (further attacks) or as the regular
        // calculator's column (attack 1 and the defender).
        function sideControlParts(side, key, isDefender) {
            let co = engine.normalizeCoName(side.co?.co_name);
            let starsHtml = `<span class="awbwe-mh-stars"><img src="terrain/terrainstar.gif" draggable="false">${stars(side)}</span>`;
            return {
                co: `
  <img class="awbwe-mh-co" src="${esc(coImage(side.co))}" data-action="co" data-key="${key}" title="${esc(coTitle(side.co))}" draggable="false">`,
                unit: `
  <span class="awbwe-mh-unit" data-action="unit" data-key="${key}" title="${esc(side.unit.units_name)}">
    <img src="${esc(unitImage(side))}" draggable="false">${hpOverlay(side.hpMax ?? side.hp)}
  </span>`,
                hp: isDefender ? templateDefenderHp(side) : `
  <label class="awbwe-mh-field" title="HP">
    <img src="terrain/hp.gif" draggable="false">
    <input type="text" data-field="hp" data-key="${key}" value="${esc(side.hp)}">
  </label>`,
                terrain: `
  <span class="awbwe-mh-terrain" data-action="terrain" data-key="${key}" title="${esc(side.terrain?.terrain_name)}">
    <img src="${esc(tileImage(side.terrain))}" draggable="false">${starsHtml}
  </span>`,
                powers: `
  <span class="awbwe-mh-powers">
    <img src="terrain/aw2/redstar.gif" data-action="power" data-power="Y" data-key="${key}" class="${side.power === "Y" ? "awbwe-mh-on" : ""}" title="CO Power" draggable="false"${powerStyle(side, "Y")}>
    <img src="terrain/aw2/bluestar.gif" data-action="power" data-power="S" data-key="${key}" class="${side.power === "S" ? "awbwe-mh-on" : ""}" title="Super CO Power" draggable="false"${powerStyle(side, "S")}>
  </span>`,
                ammo: `
  <img src="terrain/ammo_button.gif" data-action="ammo" data-key="${key}" class="awbwe-mh-ammo ${side.hasAmmo ? "" : "awbwe-mh-off"}" style="visibility: ${usesAmmo(side) ? "visible" : "hidden"}" title="Toggle out of ammo" draggable="false">`,
                towers: `
  <label class="awbwe-mh-field" title="Com towers">
    <img src="terrain/aw2/commtowericon.gif" draggable="false">
    <input type="text" class="awbwe-mh-small" data-field="towers" data-key="${key}" value="${esc(side.towers)}">
  </label>`,
                extras: `${co === "kindle" && !isDefender ? `
  <label class="awbwe-mh-field" title="Owned urban properties (High Society)">
    <img src="terrain/capt.gif" draggable="false">
    <input type="text" class="awbwe-mh-small" data-field="cities" data-key="${key}" value="${esc(side.cities)}">
  </label>` : ""}
  ${co === "colin" && !isDefender ? `
  <label class="awbwe-mh-field" title="Funds (Power of Money)">
    <img src="terrain/coin.gif" draggable="false">
    <input type="text" class="awbwe-mh-funds" data-field="funds" data-key="${key}" value="${esc(side.funds)}">
  </label>` : ""}`.trim(),
            };
        }

        // CO portrait beside two rows: the unit, its terrain and HP; then powers, ammo and com towers.
        // `rowEnds` adds extra content to the end of each row.
        function templateSideGrid(side, key, isDefender, rowEnds) {
            let p = sideControlParts(side, key, isDefender);
            return `
<div class="awbwe-mh-side">
  ${p.co}
  <div class="awbwe-mh-side-rows">
    <div class="awbwe-mh-side-row">${p.unit}${p.terrain}${p.hp}${rowEnds?.[0] ?? ""}</div>
    <div class="awbwe-mh-side-row">${p.powers}${p.ammo}${p.towers}${rowEnds?.[1] ?? ""}</div>
  </div>
</div>`;
        }

        // Attack 1 and the defender use the regular calculator's own markup, so that its stylesheet (which AWBW
        // loads on every page with the calculator) lays them out the same way, with the same sprite sizes.
        // Classes such as "hp-options" have to stay exactly as they are: AWBW matches them with div[class="..."].
        function templateCalculatorSide(side, key, isDefender) {
            let isRange = isDefender && side.hpMax !== null && side.hpMax !== undefined;
            let hpHtml = isDefender ? `
        <img src="terrain/hp.gif" data-action="range" data-key="d" class="awbwe-mh-range-toggle ${isRange ? "awbwe-mh-on" : ""}" draggable="false"
             title="${isRange ? "Click: use an exact HP" : "Click: use the range of HP that shows as this HP"}">
        <input type="text" class="awbwe-mh-defender-hp ${isRange ? "awbwe-mh-hp-range" : ""}" data-field="hp" data-key="d" value="${esc(formatDefenderHp(side))}"
               title="HP: exact (e.g. 6.3), or a range like 4.1-5 when you don't know it, with every 0.1 HP step equally likely">` : `
        <img src="terrain/hp.gif" draggable="false">
        <input type="text" data-field="hp" data-key="${key}" value="${esc(side.hp)}" title="HP">`;
            return `
<div class="${isDefender ? "calculator-defend" : "calculator-attack"} awbwe-mh-calc">
  <div class="co-options">
    <div class="co option" data-action="co" data-key="${key}" title="${esc(coTitle(side.co))}">
      <div class="selected-co"><img class="border co_portrait" src="${esc(coImage(side.co))}" draggable="false"></div>
    </div>
  </div>
  <div class="unit-options">
    <div class="unit option" data-action="unit" data-key="${key}" title="${esc(side.unit.units_name)}">
      <div class="selected-unit border awbwe-mh-calc-unit">
        <img src="${esc(unitImage(side))}" draggable="false">${hpOverlay(side.hpMax ?? side.hp, "hp-display")}
      </div>
    </div>
    <div class="hp-options">${hpHtml}
    </div>
  </div>
  <div class="terrain-options">
    <div class="terrain option" data-action="terrain" data-key="${key}" title="${esc(side.terrain?.terrain_name)}">
      <img class="selected-terrain" src="${esc(tileImage(side.terrain))}" draggable="false">
      <div class="terrain-stars"><img src="terrain/terrainstar.gif" draggable="false"><p>${stars(side)}</p></div>
    </div>
  </div>
  <div class="power-and-ammo-container">
    <div class="power-options">
      <div class="option">
        <img src="terrain/aw2/redstar.gif" data-action="power" data-power="Y" data-key="${key}" class="${side.power === "Y" ? "green-border" : ""}" title="CO Power" draggable="false"${powerStyle(side, "Y")}>
        <img src="terrain/aw2/bluestar.gif" data-action="power" data-power="S" data-key="${key}" class="${side.power === "S" ? "green-border" : ""}" title="Super CO Power" draggable="false"${powerStyle(side, "S")}>
      </div>
    </div>
    <div class="ammo-options">
      <div class="option" style="visibility: ${usesAmmo(side) ? "visible" : "hidden"}">
        <span class="red-border-strikethru" style="display: ${side.hasAmmo ? "none" : ""}"></span>
        <img src="terrain/ammo_button.gif" data-action="ammo" data-key="${key}" class="${side.hasAmmo ? "" : "red-border"}" title="Toggle out of ammo" draggable="false">
      </div>
    </div>
  </div>
  <div class="misc-options">
    <div class="city-options" title="Owned urban properties (Kindle's High Society)">
      <img src="terrain/capt.gif" draggable="false">
      <input type="text" data-field="cities" data-key="${key}" value="${esc(side.cities)}">
    </div>
    <div class="tower-options" title="Com towers">
      <img src="terrain/aw2/commtowericon.gif" draggable="false">
      <input type="text" data-field="towers" data-key="${key}" value="${esc(side.towers)}">
    </div>
    <div class="fund-options" title="Funds (Colin's Power of Money)">
      <img class="coin" src="terrain/coin.gif" draggable="false">
      <input type="text" data-field="funds" data-key="${key}" value="${esc(side.funds)}">
    </div>
  </div>
</div>`;
        }

        function formatDefenderHp(defender) {
            let isRange = defender.hpMax !== null && defender.hpMax !== undefined;
            return isRange ? `${defender.hp}-${defender.hpMax}` : String(defender.hp);
        }

        // "6.3", or a range like "4.1-5" for when the exact HP isn't known ("?" is 0.1-10).
        function parseDefenderHp(text) {
            let clamp = (hp) => Math.max(0.1, Math.min(10, Math.round(hp * 10) / 10));
            text = String(text).trim();
            if (text === "?") return { hp: 0.1, hpMax: 10 };
            let range = text.match(/^(\d*\.?\d+)\s*[-~\u2013]\s*(\d*\.?\d+)$/);
            if (range) {
                let [low, high] = [clamp(parseFloat(range[1])), clamp(parseFloat(range[2]))].sort((a, b) => a - b);
                return { hp: low, hpMax: low === high ? null : high };
            }
            let hp = parseFloat(text);
            return isNaN(hp) ? null : { hp: clamp(hp), hpMax: null };
        }

        function templateDefenderHp(defender) {
            let isRange = defender.hpMax !== null && defender.hpMax !== undefined;
            return `
  <label class="awbwe-mh-field" title="HP: exact (e.g. 6.3), or a range like 4.1-5 when you don't know it, with every 0.1 HP step equally likely">
    <img src="terrain/hp.gif" data-action="range" data-key="d" class="awbwe-mh-range-toggle ${isRange ? "awbwe-mh-on" : ""}" draggable="false"
         title="${isRange ? "Click: use an exact HP" : "Click: use the range of HP that shows as this HP"}">
    <input type="text" class="awbwe-mh-defender-hp" data-field="hp" data-key="d" value="${esc(formatDefenderHp(defender))}">
  </label>`;
        }

        // Further attacks: the same grid as attack 1, between a checkbox/number and the attack's own settings.
        function templateAttack(attack, index) {
            let selecting = pendingReplaceIndex === index && calculator.selectorPosition === "attacker";
            let p = sideControlParts(attack, "a" + index, false);
            return `
<div class="awbwe-mh-attack ${attack.enabled ? "" : "awbwe-mh-disabled"}" data-index="${index}">
  <div class="awbwe-mh-attack-body">
    <label class="awbwe-mh-attack-number" title="Include attack ${index + 1}">
      <input type="checkbox" data-field="enabled" data-key="a${index}" ${attack.enabled ? "checked" : ""}>${index + 1}
    </label>
    ${templateSideGrid(attack, "a" + index, false)}
    <div class="awbwe-mh-attack-settings">
      <div class="awbwe-mh-side-row">
        <label class="awbwe-mh-field" title="HP change to the defender before this attack, e.g. -3 for Kindle's Urban Blight or -2 for Olaf's Winter Fury. Powers can't reduce a unit below 0.1 HP.">
          HP change
          <input type="text" class="awbwe-mh-small" data-field="hpChangeBefore" data-key="a${index}" value="${esc(attack.hpChangeBefore)}">
        </label>
        <span class="awbwe-mh-row-buttons">
          <span data-action="reselect" data-index="${index}" class="${selecting ? "awbwe-mh-selecting" : ""}" title="Replace with a unit from the map">[Select]</span>
        </span>
      </div>
      <div class="awbwe-mh-side-row">
        ${p.extras}
        <span class="awbwe-mh-row-buttons">
          <span data-action="up" data-index="${index}" title="Move up">&#9650;</span>
          <span data-action="down" data-index="${index}" title="Move down">&#9660;</span>
          <span data-action="remove" data-index="${index}" title="Remove">&#10005;</span>
        </span>
      </div>
    </div>
  </div>
  <div class="awbwe-mh-result" id="awbwe-mh-result-${index}"></div>
</div>`;
        }

        function templateMatchup() {
            let first = state.attacks[0];
            let selectingAttacker = calculator.selectorPosition === "attacker";
            let selectingFirst = selectingAttacker && (pendingReplaceIndex ?? (pendingAppend || held?.append ? null : 0)) === 0;
            let selectingNew = selectingAttacker && !state.attacks.length;
            let selectingDefender = calculator.selectorPosition === "defender";
            // Attack 1's HP change is the same as editing the defender's HP, so it only shows when it's been set.
            let firstExtras = first && parseNumber(first.hpChangeBefore, 0) ? `
      <label class="awbwe-mh-field" title="HP change to the defender before this attack. For the first attack, editing the defender's HP does the same thing.">
        HP change
        <input type="text" class="awbwe-mh-small" data-field="hpChangeBefore" data-key="a0" value="${esc(first.hpChangeBefore)}">
      </label>` : "";
            let attacker = first ? `
    <div class="awbwe-mh-column-header">
      <span data-action="swap" title="Swap attacker and defender">[Swap]</span>
      <b>Attacker</b>
      <span data-action="reselect" data-index="0" class="${selectingFirst ? "awbwe-mh-selecting" : ""}" title="Replace with a unit from the map (or press A, as with the regular calculator)">[Select]</span>
    </div>
    ${templateCalculatorSide(first, "a0", false)}
    ${firstExtras ? `<div class="awbwe-mh-side-row awbwe-mh-extras">${firstExtras}</div>` : ""}
    <div class="awbwe-mh-column-result" id="awbwe-mh-result-0"></div>` : `
    <div class="awbwe-mh-column-header">
      <span></span>
      <b>Attacker</b>
      <span data-action="select-attacker" class="${selectingNew ? "awbwe-mh-selecting" : ""}" title="Pick from the map (or hold Shift+A and click a unit)">[Select]</span>
    </div>
    <div class="awbwe-mh-empty">Select an attacker from the map.</div>`;
            return `
<div class="awbwe-mh-matchup">
  <div class="awbwe-mh-column ${first ? "awbwe-mh-attack" : ""}" data-index="0">
    ${attacker}
  </div>
  <div class="awbwe-mh-column awbwe-mh-defender">
    <div class="awbwe-mh-column-header">
      <span></span>
      <b>Defender</b>
      <span data-action="select-defender" class="${selectingDefender ? "awbwe-mh-selecting" : ""}" title="Pick from the map (or hold D and click a unit)">[Select]</span>
    </div>
    ${templateCalculatorSide(state.defender, "d", true)}
    <div class="awbwe-mh-column-result" id="awbwe-mh-counter-0"></div>
  </div>
</div>`;
        }

        function render() {
            if (state.mode !== "multi") return;
            if (!state.defender) syncFromCalculator();
            // Attack 1 is the regular calculator's attacker, so it's always included.
            if (state.attacks[0]) state.attacks[0].enabled = true;
            let selectingAttacker = calculator.selectorPosition === "attacker" && (pendingAppend || held?.append);
            root.style.left = (state.position?.x ?? 200) + "px";
            root.style.top = (state.position?.y ?? 200) + "px";
            root.style.width = state.width ? state.width + "px" : "";
            root.innerHTML = `
<header class="awbwe-mh-titlebar" data-drag="1">
  Multi-hit calculator
  <span class="awbwe-mh-switch" data-action="simple" title="Switch to the simple calculator">Simple</span>
  <span class="awbwe-mh-help" title="${esc(kHelpText)}">?</span>
  <span class="awbwe-mh-close" data-action="close" title="Close">&#10005;</span>
</header>
${templateMatchup()}
<div class="awbwe-mh-body">
  <div class="awbwe-mh-section-header">
    More attacks
    <span data-action="add" title="Add a copy of the last attack">[Add]</span>
    <span data-action="select-attacker" class="${selectingAttacker && state.attacks.length ? "awbwe-mh-selecting" : ""}" title="Add a unit from the map (or hold Shift+A and click units)">[Add from map]</span>
    <span data-action="clear" title="Remove all attacks after the first">[Clear]</span>
  </div>
  <div class="awbwe-mh-attacks">
    ${state.attacks.slice(1).map((attack, i) => templateAttack(attack, i + 1)).join("") ||
      `<div class="awbwe-mh-empty">Hold Shift+A and click units to add attacks.</div>`}
  </div>
  <div class="awbwe-mh-summary" id="awbwe-mh-summary"></div>
</div>`;
            renderResults();
        }

        // One chip per possible outcome (KO, then each HP that can remain), shaded by its probability.
        // The KO chip only shows when a KO is possible.
        function templateOutcomes(summary) {
            return summary.byDisplayHp.map((p, hp) => p > 0 ? templateOutcomeChip(hp, p) : "").join("");
        }

        function templateOutcomeChip(hp, p) {
            let fill = (Math.min(1, p) * 100).toFixed(1);
            let label = hp === 0 ? "KO" : hp + " HP";
            return `<span class="awbwe-mh-outcome ${hp === 0 ? "awbwe-mh-outcome-ko" : ""}"
      style="--awbwe-mh-fill: ${fill}%" title="${hp === 0 ? "Destroyed" : hp + " HP left"}: ${formatPercent(p)}">${label} <b>${formatPercent(p)}</b></span>`;
        }

        function formatCounterRange({ min, max }) {
            return `${min === max ? min : min + " - " + max}%`;
        }

        // Under the defender: a row for each HP it can be left at, with the counter it then deals (marked with
        // the fire icon, like the regular calculator's defender column).
        function templateOutcomeRows(result) {
            let counterAt = new Map(result.counterByHp.map((counter) => [counter.defenderHp, counter]));
            let rows = result.after.byDisplayHp.map((p, hp) => {
                if (p <= 0) return "";
                let counter = hp > 0 && counterAt.get(hp);
                return `${templateOutcomeChip(hp, p)}<span class="awbwe-mh-counter-hp">${counter ? `
<span title="Counter at ${hp} HP, average ${counter.mean.toFixed(1)}%"><img src="terrain/fire.gif" draggable="false"> ${formatCounterRange(counter)}</span>` : ""}</span>`;
            });
            return `<div class="awbwe-mh-outcome-rows" title="Average HP left: ${(result.after.meanHp / 10).toFixed(2)}">${rows.join("")}</div>`;
        }

        function renderResults() {
            if (state.mode !== "multi" || !state.defender) return;
            let enabled = state.attacks.map((attack, index) => ({ attack, index })).filter((x) => x.attack.enabled);
            let defender = toEngineSide(state.defender);
            let toInternalHp = (hp) => Math.round(Math.max(0.1, Math.min(10, parseNumber(hp, 10))) * 10);
            defender.hp = toInternalHp(state.defender.hp);
            if (state.defender.hpMax !== null && state.defender.hpMax !== undefined) {
                defender.hpMax = toInternalHp(state.defender.hpMax);
            }
            let results = engine.calculateMultihit(defender, enabled.map(({ attack }) => Object.assign(
                toEngineSide(attack), { hpChangeBefore: parseNumber(attack.hpChangeBefore, 0) })));

            let defUnit = engine.normalizeUnitName(state.defender.unit.units_name);
            let unitCost = (kUnitCosts[defUnit] || 0) * (kCoCostMultipliers[engine.normalizeCoName(state.defender.co?.co_name)] || 1);

            let setHtml = (id, html) => {
                let element = document.getElementById(id);
                if (element) element.innerHTML = html;
            };
            state.attacks.forEach((attack, index) => {
                let position = enabled.findIndex((x) => x.index === index);
                let result = results[position];
                let message = null;
                if (position === -1) {
                    message = `<span class="awbwe-mh-dim">Skipped</span>`;
                } else if (result.before.koChance >= 1) {
                    message = `<span class="awbwe-mh-dim">The defender is already destroyed.</span>`;
                } else if (!result.canAttack) {
                    message = `<span class="awbwe-mh-warning">${esc(attack.unit.units_name)} can't attack ${esc(state.defender.unit.units_name)}${attack.hasAmmo || !usesAmmo(attack) ? "" : " without ammo"}.</span>`;
                }
                if (message) {
                    setHtml("awbwe-mh-result-" + index, message);
                    if (index === 0) {
                        setHtml("awbwe-mh-counter-0", "");
                    }
                    return;
                }
                let meanDisplay = (summary) => summary.byDisplayHp.reduce((sum, p, hp) => sum + p * hp, 0);
                let fundsDamage = Math.max(0, (meanDisplay(result.before) - meanDisplay(result.after)) * unitCost / 10);
                let counterHtml = "";
                if (!result.canCounter) {
                    counterHtml = `<span class="awbwe-mh-dim">No counter</span>`;
                } else if (result.counter.min !== null) {
                    // Like the regular calculator, the counter at each HP the defender can strike back at, e.g.
                    // "@2HP 7 - 8%". The KO chip already says when the defender never survives to counter.
                    let byHp = result.counterByHp.map((counter) => `
<span class="awbwe-mh-counter-hp" title="At ${counter.defenderHp} HP (${formatPercent(counter.probability)} chance), average ${counter.mean.toFixed(1)}%"><b>@${counter.defenderHp}HP</b> ${formatCounterRange(counter)}</span>`);
                    counterHtml = `<span class="awbwe-mh-counter"><span class="awbwe-mh-dim">${result.counterFirst ? "Counters first" : "Counter"}</span>${byHp.join("")}</span>`;
                }
                let damageHtml = `<span><img src="terrain/fire.gif" draggable="false"> ${formatRange(result.damage, "%")}</span>`;
                let fundsHtml = `<span title="Average funds damage"><img src="terrain/coin.gif" draggable="false"> ~${Math.round(fundsDamage).toLocaleString()}</span>`;
                let outcomesHtml = `<div class="awbwe-mh-result-line" title="Average HP left: ${(result.after.meanHp / 10).toFixed(2)}">${templateOutcomes(result.after)}</div>`;
                if (index === 0) {
                    // Laid out like the regular calculator: damage under the attacker; the defender's HP after
                    // the attack (in place of its "@N HP") and the counter under the defender.
                    setHtml("awbwe-mh-result-0", `
<div class="awbwe-mh-result-line">${damageHtml}</div>
<div class="awbwe-mh-result-line">${fundsHtml}</div>`);
                    // Sonja's Counter Break strikes back before the attack, at the defender's HP before it, so
                    // those counters don't line up with the HP left afterwards and get their own line.
                    let separateCounter = !result.canCounter || result.counterFirst;
                    setHtml("awbwe-mh-counter-0", result.counterFirst ? `${outcomesHtml}<div class="awbwe-mh-result-line">${counterHtml}</div>`
                        : `${templateOutcomeRows(result)}${separateCounter ? `<div class="awbwe-mh-result-line">${counterHtml}</div>` : ""}`);
                } else {
                    setHtml("awbwe-mh-result-" + index, `
<div class="awbwe-mh-result-line awbwe-mh-spaced">${damageHtml}${fundsHtml}${counterHtml}</div>
${outcomesHtml}`);
                }
            });

            let summary = document.getElementById("awbwe-mh-summary");
            if (summary) {
                let last = results[results.length - 1];
                summary.innerHTML = last
                    ? `After ${results.length} attack${results.length === 1 ? "" : "s"}: <b>${formatPercent(last.after.koChance)}</b> chance to destroy &middot; HP left avg ${(last.after.meanHp / 10).toFixed(2)}`
                    : "";
            }
        }

        // Re-renders after a change; `structural` changes rebuild the whole panel, others only the results.
        function changed(structural) {
            saveState();
            if (structural) {
                render();
            } else {
                renderResults();
            }
        }

        // ---- Events ----

        function sideForKey(key) {
            if (key === "d") return state.defender;
            return state.attacks[parseInt(key.substring(1))];
        }

        // Clicking into a field selects what's in it, so typing replaces the old value rather than inserting into
        // it (which turns a range such as 8.1-9 into something that no longer parses). Deferred, because the
        // click itself places the caret after the field gets focus.
        root.addEventListener("focusin", (e) => {
            let input = e.target;
            if (!isOwnTextInput(input)) return;
            setTimeout(() => {
                if (document.activeElement === input) input.select();
            }, 0);
        });

        // Something on AWBW's game page treats text fields as whole numbers: on a key press it clears a field
        // holding "9." or "6-", and it fires change events while typing, so decimals and ranges couldn't be
        // typed. Key and input events from this window's own fields are stopped here, before they reach the
        // document, and handled directly. (Typing itself is the browser's default action, so it still happens.)
        for (let type of ["keydown", "keypress", "keyup", "beforeinput", "input"]) {
            window.addEventListener(type, (e) => {
                if (!isOwnTextInput(e.target)) return;
                if (type.startsWith("key") && isSelectionHotkey(e)) return;
                e.stopPropagation();
                if (type === "input") onFieldInput(e);
            }, true);
        }

        function onFieldInput(e) {
            let field = e.target.dataset?.field;
            let side = e.target.dataset?.key && sideForKey(e.target.dataset.key);
            if (!field || !side) return;
            if (field === "hp") {
                if (e.target.dataset.key === "d") {
                    let parsed = parseDefenderHp(e.target.value);
                    if (!parsed) return;
                    Object.assign(side, parsed);
                } else {
                    let hp = parseNumber(e.target.value, null);
                    if (hp === null) return;
                    side.hp = Math.max(1, Math.min(10, Math.round(hp)));
                }
                // Keep the HP badge on the sprite in sync without rebuilding the inputs.
                let unitElement = e.target.closest(".awbwe-mh-side, .awbwe-mh-calc").querySelector(".awbwe-mh-unit, .awbwe-mh-calc-unit");
                let overlayClass = unitElement.classList.contains("selected-unit") ? "hp-display" : undefined;
                unitElement.innerHTML = `<img src="${esc(unitImage(side))}" draggable="false">${hpOverlay(side.hpMax ?? side.hp, overlayClass)}`;
            } else {
                side[field] = parseNumber(e.target.value, 0);
            }
            changed(false);
        }

        // These update in place rather than re-rendering, so that the click that blurred the input
        // still lands on the element that was clicked.
        root.addEventListener("change", (e) => {
            let field = e.target.dataset?.field;
            let side = e.target.dataset?.key && sideForKey(e.target.dataset.key);
            if (!field || !side) return;
            if (field === "enabled") {
                side.enabled = e.target.checked;
                e.target.closest(".awbwe-mh-attack").classList.toggle("awbwe-mh-disabled", !side.enabled);
                changed(false);
            } else if (document.activeElement !== e.target) {
                // Show the value that's actually being used once the field loses focus (not while it's being
                // typed in, in case anything else fires change events).
                if (field === "hp" && e.target.dataset.key === "d") {
                    e.target.value = formatDefenderHp(side);
                    e.target.classList.toggle("awbwe-mh-hp-range", side.hpMax !== null && side.hpMax !== undefined);
                } else {
                    e.target.value = side[field];
                }
            }
        });

        root.addEventListener("click", (e) => {
            let target = e.target.closest("[data-action]");
            if (!target || !root.contains(target)) return;
            let action = target.dataset.action;
            let side = target.dataset.key ? sideForKey(target.dataset.key) : null;
            let index = parseInt(target.dataset.index);
            switch (action) {
            case "close": closeCalculator(); break;
            case "simple": showSimple(); break;
            case "co": pickCo(target, side); break;
            case "unit": pickUnit(target, side); break;
            case "terrain": pickTerrain(target, side); break;
            case "power":
                side.power = side.power === target.dataset.power ? "N" : target.dataset.power;
                changed(true);
                break;
            case "ammo":
                side.hasAmmo = !side.hasAmmo;
                changed(true);
                break;
            case "range":
                if (side.hpMax === null || side.hpMax === undefined) {
                    // Start from everything that shows as the current displayed HP, e.g. 5 HP -> 4.1 - 5.0.
                    let display = Math.max(1, Math.ceil(side.hp));
                    side.hp = Math.round((display - 0.9) * 10) / 10;
                    side.hpMax = display;
                } else {
                    side.hp = side.hpMax;
                    side.hpMax = null;
                }
                changed(true);
                break;
            case "select-defender": selectFromMap("defender"); break;
            case "select-attacker": selectFromMap("attacker", "append"); break;
            case "reselect": selectFromMap("attacker", index); break;
            case "add": {
                let last = state.attacks[state.attacks.length - 1];
                let attack = last ? clone(last) : makeAttack(calculator.attacker);
                attack.hpChangeBefore = 0;
                attack.enabled = true;
                state.attacks.push(attack);
                changed(true);
                break;
            }
            case "clear":
                state.attacks = state.attacks.slice(0, 1);
                changed(true);
                break;
            case "swap": {
                let first = state.attacks[0];
                let oldDefender = clone(state.defender);
                oldDefender.hp = oldDefender.hpMax ?? oldDefender.hp;
                delete oldDefender.hpMax;
                let attack = makeAttack(oldDefender);
                attack.hpChangeBefore = first.hpChangeBefore;
                state.defender = makeDefender(first, false);
                delete state.defender.hpChangeBefore;
                delete state.defender.enabled;
                state.attacks[0] = attack;
                changed(true);
                break;
            }
            case "remove": {
                state.attacks.splice(index, 1);
                changed(true);
                break;
            }
            case "up":
            case "down": {
                let other = action === "up" ? index - 1 : index + 1;
                if (other < 0 || other >= state.attacks.length) break;
                [state.attacks[index], state.attacks[other]] = [state.attacks[other], state.attacks[index]];
                changed(true);
                break;
            }
            }
        });

        // Selection state changes (e.g. finishing a map pick) restyle the [Select] buttons.
        calculator.$watch("selectorPosition", () => {
            if (!calculator.selectorPosition) {
                pendingReplaceIndex = null;
                pendingAppend = false;
            }
            if (isMultiVisible()) render();
        });

        // Dragging by the title bar, like the regular calculator.
        root.addEventListener("mousedown", (e) => {
            if (!e.target.closest("[data-drag]") || e.target.closest("[data-action]")) return;
            let rect = root.getBoundingClientRect();
            drag = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
            e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
            if (!drag) return;
            let x = e.clientX - drag.offsetX + window.scrollX;
            let y = e.clientY - drag.offsetY + window.scrollY;
            root.style.left = x + "px";
            root.style.top = y + "px";
            state.position = { x, y };
        });
        window.addEventListener("mouseup", () => {
            if (drag) {
                drag = null;
                saveState();
            } else if (state.mode === "simple" && calculator.toggled) {
                // Follow the regular calculator as it's dragged, for when multi-hit opens while it's closed.
                let position = calculatorPagePosition();
                if (position) {
                    state.position = position;
                    saveState();
                }
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
            let target = e.target;
            if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
            if (!kHotkeys.includes(e.keyCode)) return;
            // A key that AWBW Advanced Hotkeys also uses is left to it.
            if (advancedHotkeysActionFor(e)) return;
            e.preventDefault();
            e.stopPropagation();
            toggleFromHotkey();
        }, true);

        addSwitchButton();
        if (calculator.toggled && state.mode === "multi") {
            render();
        }
        updateVisibility();
        console.log("Multi-hit calculator ready.");
    }
})();

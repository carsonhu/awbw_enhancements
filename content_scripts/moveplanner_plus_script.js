/*
{
    "users_username": "saltor",
    "players_id": 1299238,
    "players_team": "1299238",
    "players_countries_id": 1,
    "players_eliminated": "N",
    "players_co_id": 22,
    "co_name": "Jake",
    "co_max_power": 270000,
    "co_max_spower": 540000,
    "players_co_power": 0,
    "players_co_power_on": "N",
    "players_co_max_power": 270000,
    "players_co_max_spower": 540000,
    "players_co_image": "jake.png",
    "players_funds": 11000,
    "countries_code": "os",
    "countries_name": "Orange Star",
    "cities": 8,
    "labs": 0,
    "towers": 0,
    "other_buildings": 11,
    "players_turn_clock": 1896396,
    "players_turn_start": "2021-11-25 19:56:14",
    "players_order": 19,
    "players_income": 11000
}
 */


// Initialize to undefined to catch illegal use before we initialize it properly.
let fundsPerProperty = undefined;

function makeFakePlayerInfo(country, funds, isFirst) {
    return {
        users_username: country.name,
        players_id: 0,
        co_name: "Andy",
        co_max_power: 270000,
        co_max_spower: 540000,
        players_funds: funds,
        countries_code: country.code,
        countries_name: country.name,
        is_current_turn: isFirst,
    };
}

async function getInitialPlayerState(options, mapEntities) {
    let propertiesByCountry =
        partitionBy(mapEntities.properties, (property) => property.country.code);

    let players = scrapePlayersInfo();

    // If the moveplanner was loaded from a replay then the scraped players info
    // will be incorrect, so load it from the API instead.
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("ndx")) {
        let replayId = parseInt(urlParams.get("replays_id"));
        let ndx = parseInt(urlParams.get("ndx"));
        players = await fetchPlayersInfo(replayId, ndx);
    }

    if (players.length !== 0) {
        let latestPlayer = undefined;
        let latestPlayerStartTime = 0;
        for (let playerInfo of players) {
            let country = kCountriesByCode[playerInfo.countries_code];
            let startTime = Date.parse(playerInfo.players_turn_start);
            if (startTime > latestPlayerStartTime) {
                latestPlayer = playerInfo;
                latestPlayerStartTime = startTime;
            }
            playerInfo.is_current_turn = false;

            if (playerInfo.users_username === undefined) {
                playerInfo.users_username = country.name;
            }
            if (playerInfo.co_max_power === undefined) {
                playerInfo.co_max_power = 270000;
            }
            if (playerInfo.co_max_spower === undefined) {
                playerInfo.co_max_spower = 540000;
            }

            // If income is set and non-zero, try to infer the funding level
            if (playerInfo.players_income && playerInfo.cities != "?" && !fundsPerProperty) {
                let properties = propertiesByCountry[playerInfo.countries_code];
                let incomeProperties = properties.filter((p) => p.producesIncome()).length;
                fundsPerProperty = playerInfo.players_income / incomeProperties;
                if (playerInfo.co_name === "Sasha") {
                    fundsPerProperty -= 100;
                }
            }
        }
        // TODO: add better handling for if playerInfo is incomplete.
        if (latestPlayer === undefined) {
            latestPlayer = players[0];
        }
        latestPlayer.is_current_turn = true;

        if (!fundsPerProperty) {
            fundsPerProperty = options.options_default_funding;
        }
    } else {
        // If there's no player data, fabricate some based on the predeployed properties.
        fundsPerProperty = options.options_default_funding;;

        let isFirst = true;
        for (let country of kCountries) {
            if (country.flatName === "neutral"
                || !propertiesByCountry.hasOwnProperty(country.code)) {
                continue;
            }

            let funds = 0;
            if (isFirst) {
                let properties = propertiesByCountry[country.code];
                let incomeProperties = properties.filter((p) => p.producesIncome()).length;
                funds = incomeProperties * fundsPerProperty;
            }

            players.push(makeFakePlayerInfo(country, funds, isFirst));
            isFirst = false;
        }
    }

    return players;
}

async function getMergedTerrainInfo() {
    let terrainInfo = scrapeTerrainInfo();
    let buildingsInfo = scrapeBuildingsInfo();

    let mergedTerrainInfo = undefined;
    if (!terrainInfo || !buildingsInfo) {
        console.log("Failed to load one of terrainInfo:", terrainInfo, "or buildingsInfo:", buildingsInfo);
    } else {
        let merged = mergeMatrices(terrainInfo, buildingsInfo);
        if (matrixHasHoles(merged)) {
            console.log("Merged terrainInfo had holes, refusing to use it:", merged);
        } else {
            console.log("Loaded merged terrain info from page:", merged);
            mergedTerrainInfo = merged;
        }
    }

    // TODO: handling for broken pipe seams
    if (!mergedTerrainInfo) {
        let urlParams = new URLSearchParams(window.location.search);
        let mapsId = undefined;
        if (urlParams.has("maps_id")) {
            mapsId = parseInt(urlParams.get("maps_id"));
            console.log("Got maps_id from URL:", mapsId);
        } else {
            let mapsIdInput = document.querySelector("input[name=maps_id]");
            if (mapsIdInput && !isNaN(parseInt(mapsIdInput.value))) {
                mapsId = parseInt(mapsIdInput.value);
                console.log("Got maps_id from form input:", mapsId);
            }
        }

        if (mapsId) {
            console.log("Falling back to fetching map text.");
            mergedTerrainInfo = await fetchTerrainInfo(mapsId);
        } else {
            reportError("Couldn't find maps_id, failed to fetch map data.");
        }
    }

    return mergedTerrainInfo;
}

// Static mapping of tile patterns that have weather variants
// Tiles ending with these patterns will have _rain and _snow versions
const kWeatherTilePatterns = [
    // Terrain
    "plain", "mountain", "woods", "forest", "river", "road", "bridge", "sea", "shoal", "reef",
    // Buildings (all countries)
    "hq", "city", "base", "airport", "port", "comtower", "lab", "factory",
    // Neutral buildings
    "neutral"
];

// Function to check if a tile filename should have weather variants
function tileHasWeatherVariants(filename) {
    // Remove path and extension
    let basename = filename.split('/').pop().replace(/\.(gif|png)$/, '');

    // Check if the basename (without _rain or _snow) matches any pattern
    let cleanName = basename.replace(/_(rain|snow)$/, '');

    return kWeatherTilePatterns.some(pattern => cleanName.includes(pattern));
}

// Function to update building tiles to match the selected weather
// Note: Terrain tiles are rendered on canvas and cannot be modified
function updateTileImages(weather) {
    console.log("Updating building images for weather:", weather);

    let gamemap = document.getElementById("gamemap");
    if (!gamemap) {
        console.log("Gamemap not found");
        return;
    }

    // Find all building images (buildings are in spans with class game-building or id starting with building_)
    let buildingSpans = gamemap.querySelectorAll("span.game-building, span[id^='building_']");

    console.log("Found building spans:", buildingSpans.length);

    for (let span of buildingSpans) {
        let imgs = span.getElementsByTagName("img");
        for (let img of imgs) {
            let src = img.src;
            if (!src) continue;

            // Parse the URL
            let url = new URL(src);
            let pathname = url.pathname;
            let filename = pathname.split('/').pop();

            // Check if this building type has weather variants
            if (!tileHasWeatherVariants(filename)) {
                continue;
            }

            // Remove any existing weather suffix
            let cleanFilename = filename.replace(/_(rain|snow)(\.(gif|png))$/, '$2');

            // Add the appropriate weather suffix
            let newFilename = cleanFilename;
            if (weather === kWeatherRain) {
                newFilename = cleanFilename.replace(/\.(gif|png)$/, '_rain.$1');
            } else if (weather === kWeatherSnow) {
                newFilename = cleanFilename.replace(/\.(gif|png)$/, '_snow.$1');
            }
            // For kWeatherClear, use cleanFilename as-is

            // Update the image src
            let newPathname = pathname.substring(0, pathname.lastIndexOf('/') + 1) + newFilename;
            url.pathname = newPathname;
            img.src = url.toString();
        }
    }

    console.log("Building images updated");
}

function createWeatherToggle(parser) {
    const weatherStates = [kWeatherClear, kWeatherRain, kWeatherSnow];
    const weatherLabels = { [kWeatherClear]: "Clear", [kWeatherRain]: "Rain", [kWeatherSnow]: "Snow" };
    let currentWeather = null; // null means use actual weather from game

    // Create container for all weather buttons
    let weatherContainer = document.createElement("span");
    weatherContainer.id = "awbw-enhancements-weather-toggle";
    weatherContainer.style.marginRight = "10px";

    // Helper function to create a weather button
    function createWeatherButton(weather) {
        let button = document.createElement("button");
        button.textContent = weatherLabels[weather];
        button.style.marginLeft = "3px";
        button.style.marginRight = "3px";
        button.style.padding = "2px 8px";
        button.style.cursor = "pointer";
        button.style.border = "1px solid #999";
        button.style.borderRadius = "3px";
        button.style.backgroundColor = "#f0f0f0";
        button.style.fontWeight = "normal";

        // Add weather-specific styling
        if (weather === kWeatherRain) {
            button.style.color = "#4a90e2";
        } else if (weather === kWeatherSnow) {
            button.style.color = "#87ceeb";
        }

        button.addEventListener("click", () => {
            currentWeather = weather;
            parser.setWeatherOverride(weather);
            updateTileImages(weather);
            updateButtonStates();
        });

        return button;
    }

    // Create the three weather buttons
    let clearButton = createWeatherButton(kWeatherClear);
    let rainButton = createWeatherButton(kWeatherRain);
    let snowButton = createWeatherButton(kWeatherSnow);

    // Function to update button states (highlight active button)
    function updateButtonStates() {
        [clearButton, rainButton, snowButton].forEach(btn => {
            btn.style.fontWeight = "normal";
            btn.style.backgroundColor = "#f0f0f0";
            btn.style.borderWidth = "1px";
        });

        let activeButton = null;
        if (currentWeather === kWeatherClear) activeButton = clearButton;
        else if (currentWeather === kWeatherRain) activeButton = rainButton;
        else if (currentWeather === kWeatherSnow) activeButton = snowButton;

        if (activeButton) {
            activeButton.style.fontWeight = "bold";
            activeButton.style.backgroundColor = "#d0d0d0";
            activeButton.style.borderWidth = "2px";
        }
    }

    weatherContainer.appendChild(clearButton);
    weatherContainer.appendChild(rainButton);
    weatherContainer.appendChild(snowButton);

    // Initialize with the actual weather from the game
    currentWeather = parser.weatherCode;
    updateButtonStates();
    updateTileImages(currentWeather); // Initialize tile graphics to match current weather

    // Find the Unwait All button and insert the weather toggle before it
    let allDivs = document.querySelectorAll("div");
    console.log("Weather toggle: searching through divs for Unwait All");
    for (let div of allDivs) {
        if (div.textContent.trim() === "Unwait All") {
            console.log("Weather toggle: found Unwait All div:", div);
            // Insert weather toggle before this div
            div.parentNode.insertBefore(weatherContainer, div);
            console.log("Weather toggle: inserted before Unwait All");
            break;
        }
    }

    return weatherContainer;
}

// TODO: support for "undo"

function injectRequestedStyles(options) {
    if (options.options_menu_opacity === 1) {
        return;
    }

    let s = document.createElement("style");
    s.appendChild(document.createTextNode(`
    #options-menu ul, #build-menu ul {
      background-color: rgb(221, 221, 221, ${options.options_menu_background_alpha});
    }
    #options-menu ul li:hover, #build-menu ul li:hover {
      background-color: rgb(190, 190, 190, ${options.options_menu_background_alpha});
    }`));
    (document.head || document.documentElement).appendChild(s);
}

// --- Quick actions ---
//
// The hotkeys drive AWBW's own menus, so they get everything AWBW does for a menu action (the undo log,
// missile ranges, capture icons, tower counts). AWBW opens its menus and runs menu actions synchronously,
// inside the click, so a hotkey opens the menu and picks the option in one go. The exception is building
// conversion, whose options come from a server request (see res/moveplanner_menu_hook.js).

const kUnitMenuTopOffset = -8;   // AWBW puts a unit's menu 16px right of and 8px above the unit,
const kBuildMenuTopOffset = 0;   // and a building's build menu 16px right of it.
const kBuildingInfoTimeoutMs = 3000;

// The unit picked up with the quick move hotkey while the key is held: {unit, left, top, startTime}.
let quickMovePickup = null;

// Whether AWBW is moving a unit, which follows the cursor until the next map click drops it there.
// AWBW keeps this to itself, so it's tracked here: choosing Move starts a move, and any map click ends it.
let unitBeingMoved = false;

function trackUnitMoves() {
    let gamemap = document.getElementById("gamemap");
    let menu = document.getElementById("options-menu");
    if (!gamemap || !menu) return;
    gamemap.addEventListener("click", (e) => {
        if (!menu.contains(e.target)) unitBeingMoved = false;
    }, true);
    menu.addEventListener("click", (e) => {
        if (e.target.id === "move") unitBeingMoved = true;
    }, true);
}

// Drops the unit being moved under the cursor, the same as clicking there.
function dropMovingUnit(x, y) {
    let gamemap = document.getElementById("gamemap");
    let element = document.elementFromPoint(x, y);
    if (gamemap && element && gamemap.contains(element)) {
        element.click();
    }
}

// The unit or building under the cursor: the topmost unit or building there, looking past overlays such as
// HP badges.
function entityAt(x, y) {
    let gamemap = document.getElementById("gamemap");
    if (!gamemap) return null;
    for (let element of document.elementsFromPoint(x, y)) {
        if (!gamemap.contains(element)) continue;
        let span = element.closest("span[id^='unit_'], span[id^='building_']");
        if (span) return span;
    }
    return null;
}

function isUnit(entity) {
    return /^unit_\d+$/.test(entity?.id || "");
}

function isShown(element) {
    return !!element && element.style.display !== "none" && element.offsetParent !== null;
}

function menuIsOpenFor(menu, entity, topOffset) {
    return isShown(menu) &&
        parseInt(menu.style.left) === parseInt(entity.style.left) + 16 &&
        parseInt(menu.style.top) === parseInt(entity.style.top) + topOffset;
}

// Opens `menu` for `entity` by clicking it, as the player would. Returns whether it's open.
function openMenuFor(entity, menu, topOffset) {
    if (!entity || !menu) return false;
    // AWBW works out what was clicked from the image's parent span.
    let clickTarget = entity.querySelector("img") || entity;
    // While AWBW has something selected (an open menu, or a unit being moved), its next map click only
    // deselects it, so it can take a second click to open the menu.
    for (let i = 0; i < 2 && !menuIsOpenFor(menu, entity, topOffset); i++) {
        clickTarget.click();
    }
    return menuIsOpenFor(menu, entity, topOffset);
}

// Opens the unit's menu and runs `action` with it.
function withUnitMenu(unit, action) {
    if (!isUnit(unit)) return;
    let menu = document.getElementById("options-menu");
    if (openMenuFor(unit, menu, kUnitMenuTopOffset)) {
        action(menu);
    } else {
        console.warn("[AWBW Enhancements] Quick action: the menu didn't open for", unit.id);
    }
}

// Closes the unit menu the way AWBW does when the player clicks a part of it that isn't an option.
function closeUnitMenu(menu) {
    menu.click();
}

function clickMenuItem(menu, selector) {
    let item = menu.querySelector(selector);
    if (item) {
        item.click();
    } else {
        console.warn("[AWBW Enhancements] Quick action: no", selector, "in the menu");
    }
}

function setUnitHp(unit, hp) {
    withUnitMenu(unit, (menu) => {
        let hpInput = menu.querySelector("#hp");
        if (!hpInput) return;
        hpInput.value = hp;
        clickMenuItem(menu, "#set-hp");
    });
}

// optionIndex 0 converts the building to the unit's army, 1 makes it neutral.
function convertBuilding(unit, optionIndex) {
    let root = document.documentElement;
    withUnitMenu(unit, (menu) => {
        let clickOption = () => {
            // The player may have moved on while the options were loading.
            if (!menuIsOpenFor(menu, unit, kUnitMenuTopOffset)) return;
            let options = menu.querySelectorAll("#building-options li");
            if (options.length > optionIndex) {
                (options[optionIndex].querySelector("img") || options[optionIndex]).click();
            } else {
                // No options when the unit isn't on a building, it's on an HQ or silo, or AWBW's server has
                // nothing for the tile (often the case in replays). Don't leave the menu open for nothing.
                closeUnitMenu(menu);
            }
        };

        // The request for this menu's options is the latest one: either the click that just opened the
        // menu sent it, or the menu was already open and nothing has been requested since.
        let sent = root.dataset.awbweBuildingInfoSent;
        if (sent === undefined) {
            // The hook isn't installed, so the best we can do is use whatever options are showing.
            clickOption();
            return;
        }
        if (root.dataset.awbweBuildingInfoReady === sent) {
            clickOption();
            return;
        }
        let timeout = null;
        let onReady = (e) => {
            if (e.detail !== sent) return;
            document.removeEventListener("awbwe-building-info", onReady);
            clearTimeout(timeout);
            clickOption();
        };
        document.addEventListener("awbwe-building-info", onReady);
        timeout = setTimeout(() => {
            document.removeEventListener("awbwe-building-info", onReady);
            console.warn("[AWBW Enhancements] Quick convert: timed out waiting for the building's options");
            if (menuIsOpenFor(menu, unit, kUnitMenuTopOffset)) closeUnitMenu(menu);
        }, kBuildingInfoTimeoutMs);
    });
}

function buildUnit(building, unitName) {
    let buildMenu = document.getElementById("build-menu");
    // Nothing opens for neutral buildings.
    if (!openMenuFor(building, buildMenu, kBuildMenuTopOffset)) return;
    let item = Array.from(buildMenu.querySelectorAll("ul#units li"))
        .find((li) => li.textContent.trim() === unitName);
    if (item) item.click();
}

const kBaseUnits = [
    { name: "Infantry", option: "options_bindings_quick_build_infantry_hotkey" },
    { name: "Mech", option: "options_bindings_quick_build_mech_hotkey" },
    { name: "Recon", option: "options_bindings_quick_build_recon_hotkey" },
    { name: "Tank", option: "options_bindings_quick_build_tank_hotkey" },
    { name: "Md.Tank", option: "options_bindings_quick_build_md_tank_hotkey" },
    { name: "Neotank", option: "options_bindings_quick_build_neotank_hotkey" },
    { name: "Mega Tank", option: "options_bindings_quick_build_megatank_hotkey" },
    { name: "APC", option: "options_bindings_quick_build_apc_hotkey" },
    { name: "Artillery", option: "options_bindings_quick_build_artillery_hotkey" },
    { name: "Rocket", option: "options_bindings_quick_build_rocket_hotkey" },
    { name: "Anti-Air", option: "options_bindings_quick_build_anti_air_hotkey" },
    { name: "Missile", option: "options_bindings_quick_build_missile_hotkey" },
    { name: "Piperunner", option: "options_bindings_quick_build_piperunner_hotkey" },
];
const kAirportUnits = [
    { name: "T-Copter", option: "options_bindings_quick_build_t_copter_hotkey" },
    { name: "B-Copter", option: "options_bindings_quick_build_b_copter_hotkey" },
    { name: "Fighter", option: "options_bindings_quick_build_fighter_hotkey" },
    { name: "Bomber", option: "options_bindings_quick_build_bomber_hotkey" },
    { name: "Stealth", option: "options_bindings_quick_build_stealth_hotkey" },
    { name: "Black Bomb", option: "options_bindings_quick_build_black_bomb_hotkey" },
];
const kPortUnits = [
    { name: "Black Boat", option: "options_bindings_quick_build_black_boat_hotkey" },
    { name: "Lander", option: "options_bindings_quick_build_lander_hotkey" },
    { name: "Cruiser", option: "options_bindings_quick_build_cruiser_hotkey" },
    { name: "Sub", option: "options_bindings_quick_build_sub_hotkey" },
    { name: "Battleship", option: "options_bindings_quick_build_battleship_hotkey" },
    { name: "Carrier", option: "options_bindings_quick_build_carrier_hotkey" },
];

function buildableUnits(entity) {
    if (!/^building_/.test(entity?.id || "")) return [];
    // The same check AWBW uses to decide which build menu to show.
    let match = (entity.querySelector("img")?.getAttribute("src") || "").match(/(base|airport|port)(_snow|_rain|)\.gif/);
    if (!match) return [];
    return { base: kBaseUnits, airport: kAirportUnits, port: kPortUnits }[match[1]];
}

function initializeQuickActions(options) {
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    trackUnitMoves();

    document.addEventListener('keyup', (e) => {
        let quickMoveKeys = options.options_bindings_quick_move_hotkey || [66]; // Default to 'B' (66)
        if (quickMoveKeys.includes(e.keyCode)) {
            // Drag-and-drop: releasing drops the unit if it was dragged to another tile (however quickly), or
            // if the key was held. A quick tap leaves the unit following the cursor until the next press.
            let pickup = quickMovePickup;
            quickMovePickup = null;
            if (pickup && unitBeingMoved) {
                let dragged = pickup.unit.style.left !== pickup.left || pickup.unit.style.top !== pickup.top;
                if (dragged || Date.now() - pickup.startTime > 150) {
                    dropMovingUnit(mouseX, mouseY);
                }
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input field
        let active = document.activeElement;
        if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) {
            return;
        }

        // Ignore key repeats (holding down the key) and browser shortcuts
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        let hotkeyFor = (option, defaultKey) => (options[option] || [defaultKey]).includes(e.keyCode);
        let target = entityAt(mouseX, mouseY);

        // --- Quick Move ---
        // Press to pick up the unit under the cursor, and press again (or release after holding) to drop it.
        if (hotkeyFor("options_bindings_quick_move_hotkey", 66)) { // Default 'B'
            if (unitBeingMoved) {
                quickMovePickup = null;
                dropMovingUnit(mouseX, mouseY);
                return;
            }
            withUnitMenu(target, (menu) => {
                quickMovePickup = { unit: target, left: target.style.left, top: target.style.top, startTime: Date.now() };
                clickMenuItem(menu, "#move");
            });
            return;
        }

        // --- Quick Set HP ---
        // Number keys 1-9, and 0 for 10 HP
        if (e.keyCode >= 48 && e.keyCode <= 57) {
            setUnitHp(target, e.keyCode === 48 ? 10 : e.keyCode - 48);
            return;
        }

        // --- Quick Convert Building ---
        if (hotkeyFor("options_bindings_quick_convert_army_hotkey", 86)) { // Default 'V'
            convertBuilding(target, 0);
            return;
        }
        if (hotkeyFor("options_bindings_quick_convert_neutral_hotkey", 78)) { // Default 'N'
            convertBuilding(target, 1);
            return;
        }

        // --- Quick Remove / Capture / Wait / Unwait ---
        let menuItems = [
            { option: "options_bindings_quick_remove_unit_hotkey", defaultKey: 71, selector: "li#remove" },       // 'G'
            { option: "options_bindings_quick_capture_hotkey", defaultKey: 70, selector: "#set-icon #capture" }, // 'F'
            { option: "options_bindings_quick_wait_hotkey", defaultKey: 83, selector: "li#wait" },               // 'S'
            { option: "options_bindings_quick_unwait_hotkey", defaultKey: 88, selector: "li#unwait" },           // 'X'
        ];
        for (let item of menuItems) {
            if (hotkeyFor(item.option, item.defaultKey)) {
                withUnitMenu(target, (menu) => clickMenuItem(menu, item.selector));
                return;
            }
        }

        // --- Quick Build (Unit Specific) ---
        for (let unit of buildableUnits(target)) {
            if ((options[unit.option] || []).includes(e.keyCode)) {
                buildUnit(target, unit.name);
                return;
            }
        }

        // --- End Turn (M) ---
        if (hotkeyFor("options_bindings_end_turn_hotkey", 77)) { // Default 'M'
            let endTurnBtn = document.querySelector(".js-end-turn-btn");
            if (endTurnBtn && endTurnBtn.offsetParent !== null) { // Check if visible
                endTurnBtn.click();
            }
            return;
        }
    });
}

function injectRequestedScripts(options, done) {
    let snapshotElement = document.createElement("div");
    snapshotElement.id = "awbw_enhancements-savestate-snapshot";
    document.body.appendChild(snapshotElement);

    let requestElement = document.createElement("div");
    requestElement.id = "awbw_enhancements-playersInfo-patch";
    document.body.appendChild(requestElement);

    let scripts = [];
    if (options.options_enable_savestate_interception) {
        scripts.push("/res/savestate_injector.js");
    }
    scripts.push("/res/unitsinfo_patcher.js#" + JSON.stringify(options));
    scripts.push("/res/playersinfo_patcher.js");
    scripts.push("/res/moveplanner_menu_hook.js");
    console.log("Injecting requested scripts:", scripts);

    function injectScript(scriptName, onload) {
        let s = document.createElement("script");
        s.src = chrome.runtime.getURL(scriptName);
        s.onload = onload;
        (document.head || document.documentElement).appendChild(s);
    }

    let numFinished = 0;
    for (let script of scripts) {
        injectScript(script, () => {
            numFinished++;
            if (numFinished === scripts.length) {
                done();
            }
        });
    }
}

OptionsReader.instance().onOptionsReady((options) => {
    injectRequestedStyles(options);
    initializeQuickActions(options);
    // Inject scripts before performing other setup so that all of the patches are in place.
    injectRequestedScripts(options, async () => {
        if (!options.options_enable_moveplanner_plus) {
            console.log("Moveplanner plus disabled, exiting setup");
            return;
        }

        let gamemap = document.getElementById("gamemap");
        let replayContainer = document.getElementById("replay-container");
        if (!gamemap || !replayContainer) {
            reportError("Failed to find gamemap (", gamemap, ") or replayContainer (", replayContainer, ")");
            return;
        }

        let parser = new GameStateParser(gamemap);
        let initialMapEntities = parser.parseMapEntities();
        let baseUrl = initialMapEntities.baseUrl || "https://awbw.amarriner.com/terrain/ani/";
        let players = await getInitialPlayerState(options, initialMapEntities);

        let profileSettingsReader = await ProfileSettingsReader.instance();
        let playersPanel = new PlayersPanel(replayContainer, baseUrl, profileSettingsReader, players);
        parser.addListener((mapEntities) => {
            playersPanel.handleUpdate(mapEntities);
        });

        // Create weather toggle button
        createWeatherToggle(parser);

        let buildMenu = document.getElementById("build-menu");
        let buildMenuListener = new BuildMenuListener(buildMenu, initialMapEntities.properties);
        parser.addListener((mapEntities) => {
            buildMenuListener.onMapUpdate(mapEntities);
        });
        buildMenuListener.addUnitBuildListener((property, builtUnit) => {
            playersPanel.handleUnitBuilt(property, builtUnit);
        });

        if (options.options_enable_move_range_preview) {
            let mergedTerrainInfo = await getMergedTerrainInfo();
            if (mergedTerrainInfo) {
                let cursorTracker = new CursorTracker(options);
                let rangePreview = new MoveRangePreview(gamemap, mergedTerrainInfo, players);
                parser.addListener(rangePreview.onMapUpdate.bind(rangePreview));
                cursorTracker.addCursorUpdateListener(rangePreview.onCursorUpdate.bind(rangePreview));
            }
        }

        if (options.options_enable_savestate_interception) {
            let loadStateInput = document.getElementById("load-state-input");
            let savestateInterceptor = new SavestateInterceptor(options, loadStateInput, [playersPanel]);

            let controlsTable = document.getElementById("game-controls-table");
            let savestateManager = new SavestateManager(controlsTable, baseUrl, savestateInterceptor);
            savestateInterceptor.addOnUploadListener(savestateManager.onSavestateUpload.bind(savestateManager));
            playersPanel.addTurnStartListener(savestateManager.onTurnStart.bind(savestateManager));
        }

        let observer = new MutationObserver((mutations, observer) => {
            // Ignore cursor-only mutations, they can't affect game state.
            let isInteresting = false;
            for (let mutation of mutations) {
                if (mutation.target.id != "cursor") {
                    isInteresting = true;
                    break;
                }
            }

            if (isInteresting) {
                parser.handleMapUpdate();
            }
        });
        observer.observe(gamemap, { subtree: true, childList: true, attributes: true });

        if (options.options_enable_bugfix_restore_clobbers_removed_unit_icons) {
            let removedUnitsPanel = document.getElementById("planner_removed_units");
            if (removedUnitsPanel) {
                (new MutationObserver(() => {
                    let childSpans = removedUnitsPanel.getElementsByTagName("span");
                    for (let child of childSpans) {
                        if (child.id.startsWith("unit_")) {
                            child.removeAttribute("id");
                        }
                    }
                })).observe(removedUnitsPanel, { childList: true });
            }
        }

        initializeHotkeyReference(options);
        // Grab initial state to initialize stuff
        parser.handleMapUpdate();

        await playersPanel.startFirstTurn();
    });
});

function initializeHotkeyReference(options) {
    // Find a place to inject the button. The game controls table seems appropriate.
    let controlsTable = document.getElementById("game-controls-table");
    if (!controlsTable) return;

    // Create the button
    let hotkeyBtn = document.createElement("div");
    hotkeyBtn.className = "awbwenhancements-hotkey-btn";
    hotkeyBtn.innerHTML = '<i class="fas fa-wrench"></i> Hotkeys';
    hotkeyBtn.title = "View Keyboard Shortcuts";

    // Find a place to inject the button.
    // User wants it to the right of the "Your Games" select box.
    let gameSelect = document.getElementById("your_games");
    if (gameSelect && gameSelect.parentNode) {
        let container = gameSelect.parentNode;
        // The container (td) has a fixed width of 220px which matches the select.
        // We need to increase it or set to auto to fit the button.
        container.style.width = "auto";
        container.appendChild(hotkeyBtn);
    } else {
        // Fallback: Inject it into the controls area (e.g., near the snapshot buttons)
        let controlsTable = document.getElementById("game-controls-table");
        if (controlsTable) {
            let buttonContainer = controlsTable.querySelector("td");
            if (buttonContainer) {
                buttonContainer.appendChild(hotkeyBtn);
            }
        }
    }

    // Create the modal
    let modal = document.createElement("div");
    modal.className = "awbwenhancements-hotkey-modal";
    modal.innerHTML = `
        <div class="awbwenhancements-close-btn">X (Esc)</div>
        <h3>Keyboard Shortcuts</h3>
        <div class="awbwenhancements-hotkey-content"></div>
    `;
    document.body.appendChild(modal);

    // Populate content
    let contentDiv = modal.querySelector(".awbwenhancements-hotkey-content");

    const hotkeySections = [
        {
            title: "General Actions",
            items: [
                { label: "Quick Move", option: "options_bindings_quick_move_hotkey", default: "B" },
                { label: "Quick Capture", option: "options_bindings_quick_capture_hotkey", default: "F" },
                { label: "Quick Wait", option: "options_bindings_quick_wait_hotkey", default: "S" },
                { label: "Quick Unwait", option: "options_bindings_quick_unwait_hotkey", default: "X" },
                { label: "Quick Remove", option: "options_bindings_quick_remove_unit_hotkey", default: "G" },
                { label: "Convert Property (Army)", option: "options_bindings_quick_convert_army_hotkey", default: "V" },
                { label: "Convert Property (Neutral)", option: "options_bindings_quick_convert_neutral_hotkey", default: "N" },
                { label: "End Turn", option: "options_bindings_end_turn_hotkey", default: "M" },
                { label: "Toggle Calculator", option: null, default: "C" },
                { label: "Set HP", option: null, default: "0-9" },
            ]
        },
        {
            title: "Base Units",
            type: "units",
            items: [
                { image: "osinfantry.gif", option: "options_bindings_quick_build_infantry_hotkey", default: "Q" },
                { image: "osmech.gif", option: "options_bindings_quick_build_mech_hotkey", default: "" },
                { image: "osrecon.gif", option: "options_bindings_quick_build_recon_hotkey", default: "W" },
                { image: "osapc.gif", option: "options_bindings_quick_build_apc_hotkey", default: "" },
                { image: "osartillery.gif", option: "options_bindings_quick_build_artillery_hotkey", default: "E" },
                { image: "ostank.gif", option: "options_bindings_quick_build_tank_hotkey", default: "R" },
                { image: "osanti-air.gif", option: "options_bindings_quick_build_anti_air_hotkey", default: "T" },
                { image: "osmissile.gif", option: "options_bindings_quick_build_missile_hotkey", default: "" },
                { image: "osrocket.gif", option: "options_bindings_quick_build_rocket_hotkey", default: "" },
                { image: "osmd.tank.gif", option: "options_bindings_quick_build_md_tank_hotkey", default: "" },
                { image: "ospiperunner.gif", option: "options_bindings_quick_build_piperunner_hotkey", default: "" },
                { image: "osneotank.gif", option: "options_bindings_quick_build_neotank_hotkey", default: "" },
                { image: "osmegatank.gif", option: "options_bindings_quick_build_megatank_hotkey", default: "" },
            ]
        },
        {
            title: "Airport Units",
            type: "units",
            items: [
                { image: "ost-copter.gif", option: "options_bindings_quick_build_t_copter_hotkey", default: "Q" },
                { image: "osb-copter.gif", option: "options_bindings_quick_build_b_copter_hotkey", default: "W" },
                { image: "osfighter.gif", option: "options_bindings_quick_build_fighter_hotkey", default: "E" },
                { image: "osbomber.gif", option: "options_bindings_quick_build_bomber_hotkey", default: "R" },
                { image: "osstealth.gif", option: "options_bindings_quick_build_stealth_hotkey", default: "" },
                { image: "osblackbomb.gif", option: "options_bindings_quick_build_black_bomb_hotkey", default: "" },
            ]
        },
        {
            title: "Port Units",
            type: "units",
            items: [
                { image: "osblackboat.gif", option: "options_bindings_quick_build_black_boat_hotkey", default: "T" },
                { image: "oslander.gif", option: "options_bindings_quick_build_lander_hotkey", default: "Q" },
                { image: "oscruiser.gif", option: "options_bindings_quick_build_cruiser_hotkey", default: "W" },
                { image: "ossub.gif", option: "options_bindings_quick_build_sub_hotkey", default: "R" },
                { image: "osbattleship.gif", option: "options_bindings_quick_build_battleship_hotkey", default: "E" },
                { image: "oscarrier.gif", option: "options_bindings_quick_build_carrier_hotkey", default: "" },
            ]
        }
    ];

    let uiRefs = {};

    hotkeySections.forEach(section => {
        // Header
        let header = document.createElement("div");
        header.className = "awbwenhancements-hotkey-header";
        header.innerText = section.title;
        contentDiv.appendChild(header);

        let container = document.createElement("div");
        let itemsContainer = document.createElement("div");
        if (section.type === "units") {
            itemsContainer.className = "awbwenhancements-hotkey-section";
        }
        contentDiv.appendChild(itemsContainer);

        section.items.forEach(item => {
            let keys = item.default;
            if (item.option && options[item.option]) {
                // Map key codes to names if possible, or use raw codes
                keys = options[item.option].map(code => {
                    return String.fromCharCode(code);
                }).join(" / ");
            }
            if (keys === "") keys = "-";

            let entry = document.createElement("div");

            if (section.type === "units") {
                entry.className = "awbwenhancements-hotkey-unit-entry";
                entry.innerHTML = `
                    <img src="https://awbw.amarriner.com/terrain/aw2/${item.image}" class="awbwenhancements-hotkey-unit-image" title="${item.label || ''}">
                    <span class="awbwenhancements-hotkey-key editable" data-option="${item.option}" data-default="${item.default}">${keys}</span>
                `;
            } else {
                entry.className = "awbwenhancements-hotkey-entry";
                entry.innerHTML = `
                    <span class="awbwenhancements-hotkey-label">${item.label}</span>
                    <span class="awbwenhancements-hotkey-key editable" data-option="${item.option}" data-default="${item.default}">${keys}</span>
                `;
            }

            itemsContainer.appendChild(entry);

            // Store reference for easier updates
            if (item.option) {
                let keySpan = entry.querySelector(".awbwenhancements-hotkey-key");
                uiRefs[item.option] = keySpan;

                keySpan.title = "Click to edit";
                keySpan.addEventListener("click", (e) => {
                    e.stopPropagation();

                    // Reset any other editing keys
                    document.querySelectorAll(".editing").forEach(el => {
                        el.classList.remove("editing");
                        el.innerText = el.dataset.originalText;
                    });

                    keySpan.dataset.originalText = keySpan.innerText;
                    keySpan.innerText = "Press key...";
                    keySpan.classList.add("editing");

                    const handleKeyDown = (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        let newCode = event.keyCode;
                        let newKeys = [];

                        // Prevent assigning 'C' (Calculator)
                        if (newCode === 67) {
                            alert("The 'C' key is reserved for the Calculator.");
                            keySpan.innerText = keySpan.dataset.originalText;
                            keySpan.classList.remove("editing");
                            document.removeEventListener("keydown", handleKeyDown, true);
                            document.removeEventListener("click", handleClickOutside, true);
                            return;
                        }

                        // Backspace or Delete to clear
                        if (newCode === 8 || newCode === 46) {
                            newKeys = [];
                        } else {
                            newKeys = [newCode];
                        }

                        // --- Conflict Resolution ---
                        if (newKeys.length > 0) {
                            hotkeySections.forEach(checkSection => {
                                checkSection.items.forEach(checkItem => {
                                    // Skip self and non-options
                                    if (checkItem.option === item.option || !checkItem.option) return;

                                    let isConflict = false;
                                    // 1. General Actions conflict with everything
                                    if (section.title === "General Actions") isConflict = true;
                                    // 2. Everything conflicts with General Actions
                                    else if (checkSection.title === "General Actions") isConflict = true;
                                    // 3. Units conflict with units in the same facility
                                    else if (section.title === checkSection.title) isConflict = true;

                                    if (isConflict) {
                                        let otherKeys = options[checkItem.option] || [];
                                        if (otherKeys.includes(newCode)) {
                                            // Remove the conflicting key
                                            let filteredKeys = otherKeys.filter(k => k !== newCode);
                                            options[checkItem.option] = filteredKeys;

                                            // Save and Update UI for the conflict
                                            let saveObj = {};
                                            saveObj[checkItem.option] = filteredKeys;
                                            chrome.storage.sync.set(saveObj);

                                            if (uiRefs[checkItem.option]) {
                                                let displayKeys = filteredKeys.map(code => String.fromCharCode(code)).join("/");
                                                if (displayKeys === "") displayKeys = "-";
                                                uiRefs[checkItem.option].innerText = displayKeys;
                                            }
                                        }
                                    }
                                });
                            });
                        }

                        // Update options object locally
                        options[item.option] = newKeys;

                        // Save to storage
                        let saveObj = {};
                        saveObj[item.option] = newKeys;
                        chrome.storage.sync.set(saveObj, () => {
                            console.log("Saved hotkey:", item.label, newKeys);
                        });

                        // Update UI
                        let displayKeys = newKeys.map(code => String.fromCharCode(code)).join("/");
                        if (displayKeys === "") displayKeys = "-";
                        keySpan.innerText = displayKeys;
                        keySpan.classList.remove("editing");

                        // Remove listener
                        document.removeEventListener("keydown", handleKeyDown, true);
                        document.removeEventListener("click", handleClickOutside, true);
                    };

                    const handleClickOutside = (event) => {
                        if (event.target !== keySpan) {
                            keySpan.innerText = keySpan.dataset.originalText;
                            keySpan.classList.remove("editing");
                            document.removeEventListener("keydown", handleKeyDown, true);
                            document.removeEventListener("click", handleClickOutside, true);
                        }
                    };

                    document.addEventListener("keydown", handleKeyDown, true);
                    // Delay click listener slightly to avoid immediate trigger
                    setTimeout(() => {
                        document.addEventListener("click", handleClickOutside, true);
                    }, 50);
                });
            }
        });
    });

    // Event listeners
    hotkeyBtn.addEventListener("click", () => {
        modal.style.display = "block";
    });

    modal.querySelector(".awbwenhancements-close-btn").addEventListener("click", () => {
        modal.style.display = "none";
    });

    // Close on click outside
    window.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });

    // Close on Esc
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "block") {
            modal.style.display = "none";
        }
    });
}

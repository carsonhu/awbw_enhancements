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

// --- Quick Move Hotkey Implementation ---

let hoveredEntity = null;
let quickMoveStartTime = 0;

function initializeQuickActions(options) {
    // Track hovered entity (unit or building)
    document.addEventListener('mouseover', (e) => {
        let target = e.target;
        // Units are typically in spans with id starting with 'unit_'
        let unitSpan = target.closest("span[id^='unit_']");
        if (unitSpan) {
            hoveredEntity = unitSpan;
            return;
        }

        // Buildings don't always have a nice ID, but they are clickable elements on the map.
        // We can check if we are hovering over a span inside the gamemap that isn't a unit.
        // This is a bit broad, but since we only click on hotkey press, it should be safe.
        let mapContainer = document.getElementById("gamemap");
        if (mapContainer && mapContainer.contains(target)) {
            // Check if it's a span (tiles are spans)
            let tileSpan = target.closest("span");
            if (tileSpan) {
                hoveredEntity = tileSpan;
                return;
            }
        }

        hoveredEntity = null;
    });

    document.addEventListener('keyup', (e) => {
        let quickMoveKeys = options.options_bindings_quick_move_hotkey || [66]; // Default to 'B' (66)
        if (quickMoveKeys.includes(e.keyCode)) {
            let duration = Date.now() - quickMoveStartTime;
            if (duration > 200) {
                // Drag-and-drop behavior: if held for > 200ms, confirm move on release
                handleQuickAction(() => clickMoveOption(), 0);
            }
            quickMoveStartTime = 0;
        }
    });

    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input field
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }

        // Ignore key repeats (holding down the key)
        if (e.repeat) {
            return;
        }

        // --- Quick Move ---
        let quickMoveKeys = options.options_bindings_quick_move_hotkey || [66]; // Default to 'B' (66)

        if (quickMoveKeys.includes(e.keyCode)) {
            quickMoveStartTime = Date.now();
            handleQuickAction(() => clickMoveOption(), 0);
            return;
        }

        // --- Quick Set HP ---
        // Check for number keys 0-9
        // Key codes: 48 ('0') to 57 ('9')
        if (e.keyCode >= 48 && e.keyCode <= 57) {
            let hpValue = e.keyCode - 48;
            if (hpValue === 0) hpValue = 10;

            handleQuickAction(() => setUnitHp(hpValue), 0);
        }

        // --- Quick Convert Building ---
        let convertArmyKeys = options.options_bindings_quick_convert_army_hotkey || [86]; // Default 'V'
        if (convertArmyKeys.includes(e.keyCode)) {
            handleQuickAction(() => convertBuilding(0), 0); // 0 = First option (Army)
            return;
        }

        let convertNeutralKeys = options.options_bindings_quick_convert_neutral_hotkey || [78]; // Default 'N'
        if (convertNeutralKeys.includes(e.keyCode)) {
            handleQuickAction(() => convertBuilding(1), 0); // 1 = Second option (Neutral)
            return;
        }

        // --- Quick Remove Unit ---
        let removeUnitKeys = options.options_bindings_quick_remove_unit_hotkey || [71]; // Default 'G'
        if (removeUnitKeys.includes(e.keyCode)) {
            handleQuickAction(() => clickRemoveOption(), 0);
            return;
        }

        // --- Quick Capture ---
        let captureKeys = options.options_bindings_quick_capture_hotkey || [70]; // Default 'F'
        if (captureKeys.includes(e.keyCode)) {
            handleQuickAction(() => clickCaptureOption(), 0);
            return;
        }

        // --- Quick Build (Unit Specific) ---
        // Define buildable units for each facility type
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

        let buildableUnits = [];
        if (hoveredEntity) {
            let src = hoveredEntity.querySelector("img")?.getAttribute("src") || "";
            if (src.includes("base")) buildableUnits = kBaseUnits;
            else if (src.includes("airport")) buildableUnits = kAirportUnits;
            else if (src.includes("port")) buildableUnits = kPortUnits;
        }

        for (let unit of buildableUnits) {
            let hotkeys = options[unit.option] || [];
            if (hotkeys.includes(e.keyCode)) {
                handleQuickAction(() => clickBuildOption([unit.name]), 50);
                return;
            }
        }

        // --- End Turn (M) ---
        let endTurnKeys = options.options_bindings_end_turn_hotkey || [77]; // Default 'M'
        if (endTurnKeys.includes(e.keyCode)) {
            let endTurnBtn = document.querySelector(".js-end-turn-btn");
            if (endTurnBtn && endTurnBtn.offsetParent !== null) { // Check if visible
                endTurnBtn.click();
            }
            return;
        }
    });
}

function handleQuickAction(actionCallback, delay = 0) {
    let optionsMenu = document.getElementById("options-menu");
    let buildMenu = document.getElementById("build-menu");

    let menuVisible = (optionsMenu && optionsMenu.style.display !== "none" && optionsMenu.style.display !== "") ||
        (buildMenu && buildMenu.style.display !== "none" && buildMenu.style.display !== "");

    if (menuVisible) {
        // Menu is open, perform action immediately
        actionCallback();
    } else if (hoveredEntity) {
        // Menu is closed, but hovering over a unit/building
        // 1. Click the entity to open the menu
        let clickTarget = hoveredEntity.querySelector("img") || hoveredEntity;
        clickTarget.click();

        // 2. Wait a brief moment for menu to appear
        // Then perform action
        setTimeout(actionCallback, delay);
    }
}

function setUnitHp(hp) {
    let hpInput = document.getElementById("hp");
    if (hpInput) {
        hpInput.value = hp;
        // Dispatch events so the site recognizes the change
        hpInput.dispatchEvent(new Event('input', { bubbles: true }));
        hpInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Click the "Set HP" list item to confirm/apply
        let setHpItem = document.getElementById("set-hp");
        if (setHpItem) {
            setHpItem.click();
        }
    }
}

function convertBuilding(optionIndex) {
    // The building options are in a list inside #building-options
    // They might take a moment to appear after the menu opens, so we poll for them.
    let attempts = 0;
    const maxAttempts = 50; // 50 * 10ms = 500ms max wait

    function attemptClick() {
        let buildingOptionsList = document.getElementById("building-options");
        if (buildingOptionsList) {
            let options = buildingOptionsList.querySelectorAll("li");
            if (options.length > optionIndex) {
                // Click the image inside the list item, or the list item itself
                let target = options[optionIndex].querySelector("img") || options[optionIndex];
                target.click();
                return;
            }
        }

        attempts++;
        if (attempts < maxAttempts) {
            setTimeout(attemptClick, 10);
        }
    }

    attemptClick();
}

function clickMoveOption() {
    let moveOption = document.getElementById("move");
    if (moveOption) {
        moveOption.click();
    }
}

function clickRemoveOption() {
    // Use querySelector to target the list item specifically, avoiding the img with the same ID
    let removeOption = document.querySelector("li#remove");
    if (removeOption) {
        removeOption.click();
    }
}

function clickCaptureOption() {
    let captureOption = document.getElementById("capture");
    if (captureOption) {
        captureOption.click();
    }
}


function clickBuildOption(unitNames) {
    // unitNames is an array of strings, e.g. ["Infantry", "T-Copter", "Black Boat"]
    // We click the first one that appears in the menu.
    let buildMenu = document.getElementById("build-menu");
    if (buildMenu) {
        // Ensure the menu is actually visible before clicking anything
        if (buildMenu.style.display === "none" || buildMenu.offsetParent === null) {
            return;
        }

        let unitsList = buildMenu.querySelector("ul#units");
        if (unitsList) {
            let items = unitsList.querySelectorAll("li");
            for (let item of items) {
                let itemText = item.textContent.trim();
                if (unitNames.includes(itemText)) {
                    item.click();
                    return;
                }
            }
        }
    }
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
                })).observe(removedUnitsPanel, { subtree: true, childList: true });
            }
        }

        // Grab initial state to initialize stuff
        parser.handleMapUpdate();

        playersPanel.startFirstTurn();
    });
});

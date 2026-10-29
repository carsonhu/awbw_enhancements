// Finds the 2026 versions of COs in play (e.g. Clone Andy, DS Sonja; see lib/co_variants.js) and puts them on the
// page for the rest of the extension, without any requests to AWBW.
//
// On the game page they're read from the player cards' portraits, and saved in extension storage by game, since the
// move planner page doesn't show them: it has the regular portraits. The move planner then takes them from the game
// page it's embedded in (the move planner panel), or else from storage, or else works out what it can from its
// playersInfo (see variantsFromPlayersInfo()).
//
// Also starts res/co_variants_patcher.js in the page, which shows the versions' portraits in AWBW's calculator.

const kCoVariantsStorageKey = "co_variants_by_game";
// Games kept in storage; the oldest are dropped.
const kMaxStoredCoVariantGames = 200;

function coVariantsGameId() {
    let params = new URLSearchParams(window.location.search);
    // A replay's id is its game's.
    return params.get("games_id") || params.get("replays_id");
}

function readStoredCoVariants() {
    return new Promise((resolve) => {
        chrome.storage.local.get([kCoVariantsStorageKey], (stored) => resolve(stored[kCoVariantsStorageKey] || {}));
    });
}

async function saveCoVariants(gameId, variants) {
    let stored = await readStoredCoVariants();
    if (JSON.stringify(stored[gameId]?.variants) === JSON.stringify(variants)) return;
    stored[gameId] = { variants, savedAt: Date.now() };
    let gameIds = Object.keys(stored).sort((lhs, rhs) => stored[rhs].savedAt - stored[lhs].savedAt);
    for (let old of gameIds.slice(kMaxStoredCoVariantGames)) {
        delete stored[old];
    }
    chrome.storage.local.set({ [kCoVariantsStorageKey]: stored });
}

function variantsFromEmbeddingPage() {
    if (window.top === window) return null;
    try {
        let json = window.parent.document.documentElement.dataset.awbweCoVariants;
        return json ? JSON.parse(json) : null;
    } catch (e) {
        return null;
    }
}

async function findCoVariants() {
    let gameId = coVariantsGameId();
    if (window.location.pathname.endsWith("/game.php")) {
        let variants = AwbwCoVariants.variantsFromGamePage(document);
        if (gameId && Object.keys(variants).length > 0) {
            saveCoVariants(gameId, variants);
        }
        return variants;
    }

    let fromPage = variantsFromEmbeddingPage();
    if (fromPage) return fromPage;
    if (gameId) {
        let stored = (await readStoredCoVariants())[gameId];
        if (stored) return stored.variants;
    }
    return AwbwCoVariants.variantsFromPlayersInfo(scrapePlayersInfo(),
                                                  Number(scrapeScriptVariable("GAME_FLAGS__JJ__DS_OLAF")) > 0);
}

function injectCoVariantsPatcher() {
    let scripts = ["/lib/co_variants.js", "/res/co_variants_patcher.js"];
    function injectNext() {
        let scriptName = scripts.shift();
        if (!scriptName) return;
        let s = document.createElement("script");
        s.src = chrome.runtime.getURL(scriptName);
        s.onload = injectNext;
        (document.head || document.documentElement).appendChild(s);
    }
    injectNext();
}

// Resolves once the versions in play are on the page, for content scripts that draw COs (moveplanner_plus_script.js).
const coVariantsReady = findCoVariants().catch((error) => {
    console.warn("[AWBW Enhancements] Couldn't find the CO versions in play:", error);
    return {};
}).then((variants) => {
    AwbwCoVariants.setGameVariants(variants);
    if (Object.keys(variants).length > 0) {
        console.log("[AWBW Enhancements] CO versions in play:", variants);
        injectCoVariantsPatcher();
    }
    return variants;
});

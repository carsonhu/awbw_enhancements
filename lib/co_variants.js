// Alternate versions of COs that AWBW added in 2026 (built on an existing CO, but with different stats and powers),
// such as Clone Andy or DS Sonja. They're only on some maps, and each map allows specific versions.
//
// AWBW doesn't give them their own CO ids: playersInfo still says "Andy", id 1. The game page tells them apart by the
// portrait only (terrain/co-portraits/2026-mac/cloneandy.png), and AWBW's calculator by the game id it's sent. So the
// extension reads the portraits on the game page (content_scripts/co_variants_script.js) and keeps the versions in
// play by base CO, e.g. {andy: "cloneandy"}, on the page's <html data-awbwe-co-variants>, where both content
// scripts and page scripts can read them. A game never has two versions of one CO, since its map decides them.
//
// Loaded as a content script and as a page script (exposed as `window.AwbwCoVariants`), and in Node for tests.
(function (root) {

const kCoVariantPortraitsPrefix = "terrain/co-portraits/2026-mac/";

// Keyed by portrait file name. `cop` and `scop` are the stars each power takes in all (null when the version
// doesn't have it), as on the CO cards on AWBW's Create Game page.
const kCoVariants = {
    "cloneandy": { co: "Andy", name: "Clone Andy (RBC)", cop: 3, scop: null },
    "aw1_drake": { co: "Drake", name: "Drake (AW1)", cop: 4, scop: null },
    "aw1_max": { co: "Max", name: "Max (AW1)", cop: 3, scop: null },
    "aw1_olaf": { co: "Olaf", name: "Olaf (AW1)", cop: 3, scop: null },
    "campaign_sturm": { co: "Sturm", name: "Sturm (AW1 Campaign)", cop: null, scop: 10 },
    "ds_jess": { co: "Jess", name: "Jess (DS)", cop: 3, scop: 6 },
    "ds_olaf": { co: "Olaf", name: "Olaf (DS)", cop: 3, scop: 7 },
    "ds_kanbei": { co: "Kanbei", name: "Kanbei (DS)", cop: 4, scop: 7 },
    "ds_sonja": { co: "Sonja", name: "Sonja (DS)", cop: 3, scop: 5 },
};

const kDatasetKey = "awbweCoVariants";

function normalizeCoName(name) {
    return String(name || "").toLowerCase().replace(/[^a-z]/g, "");
}

// The version a portrait URL shows (also its grayscale "gs_" one), or null for a regular portrait.
function variantFromPortraitUrl(url) {
    let match = String(url || "").match(/co-portraits\/2026-mac\/(?:gs_)?([a-z0-9_]+)\.png/i);
    let key = match?.[1].toLowerCase();
    return key && kCoVariants[key] ? key : null;
}

function variantPortraitUrl(key, grayscale) {
    return kCoVariantPortraitsPrefix + (grayscale ? "gs_" : "") + key + ".png";
}

function variantInfo(key) {
    return kCoVariants[key] || null;
}

// {base CO: version} for the versions on the player cards in `doc` (a game page), e.g. {andy: "cloneandy"}.
function variantsFromGamePage(doc) {
    let variants = {};
    for (let img of doc.querySelectorAll(".player-overview-container img")) {
        let key = variantFromPortraitUrl(img.getAttribute("src"));
        if (key) {
            variants[normalizeCoName(kCoVariants[key].co)] = key;
        }
    }
    return variants;
}

// What the game is known to have in play, when there's no game page to read it from: a version that can't use its
// SCOP shows as a negative players_co_max_spower in playersInfo, and DS Olaf turns on GAME_FLAGS__JJ__DS_OLAF. The
// other DS versions look just like the regular CO there.
function variantsFromPlayersInfo(players, dsOlafFlag) {
    let byScopDisabled = { andy: "cloneandy", drake: "aw1_drake", max: "aw1_max", olaf: "aw1_olaf" };
    let variants = {};
    for (let player of players || []) {
        let co = normalizeCoName(player.co_name);
        if (Number(player.players_co_max_spower) < 0 && byScopDisabled[co]) {
            variants[co] = byScopDisabled[co];
        } else if (Number(player.players_co_max_power) < 0 && co === "sturm") {
            variants[co] = "campaign_sturm";
        } else if (co === "olaf" && dsOlafFlag) {
            variants[co] = "ds_olaf";
        }
    }
    return variants;
}

let cachedJson = null, cachedVariants = {};
function gameVariants(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    let json = doc?.documentElement?.dataset[kDatasetKey] || "";
    if (json !== cachedJson) {
        cachedJson = json;
        try {
            cachedVariants = json ? JSON.parse(json) : {};
        } catch (e) {
            cachedVariants = {};
        }
    }
    return cachedVariants;
}

function setGameVariants(variants, doc) {
    doc = doc || document;
    doc.documentElement.dataset[kDatasetKey] = JSON.stringify(variants || {});
}

// The version of `coName` in play in this page's game, or null.
function variantForCo(coName) {
    return gameVariants()[normalizeCoName(coName)] || null;
}

// The stars `coName`'s powers take in this game, as {cop, scop} totals (0 when it doesn't have one), or null when
// it's the regular CO.
function variantPowerStars(coName) {
    let info = variantInfo(variantForCo(coName));
    return info ? { cop: info.cop || 0, scop: info.scop || 0 } : null;
}

// Whether `coName` can use `power` ("Y" or "S") in this game.
function canUsePower(coName, power) {
    let stars = variantPowerStars(coName);
    if (!stars) return true;
    return power === "S" ? stars.scop > 0 : power === "Y" ? stars.cop > 0 : true;
}

function displayName(coName) {
    return variantInfo(variantForCo(coName))?.name || coName;
}

const AwbwCoVariants = {
    kCoVariants, kCoVariantPortraitsPrefix,
    normalizeCoName, variantFromPortraitUrl, variantPortraitUrl, variantInfo, variantsFromGamePage,
    variantsFromPlayersInfo, gameVariants, setGameVariants, variantForCo, variantPowerStars, canUsePower, displayName,
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = AwbwCoVariants;
} else {
    root.AwbwCoVariants = AwbwCoVariants;
}
})(typeof window !== "undefined" ? window : globalThis);

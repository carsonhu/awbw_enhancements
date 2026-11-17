// Whether a map is in AWBW's High Funds category, which its map page (prevmaps.php) lists but the move planner doesn't.
// Visiting a map page saves it (see map_page_script.js), so opening the planner from there needs no request.
// Opening the planner for a map whose page hasn't been seen asks AWBW for that page once.
//
// Saved in chrome.storage.local as {mapsId: {highFunds, savedAt}}, keeping the most recently seen kMaxSavedMaps.

const kMapCategoriesStorageKey = "map_categories";
const kMaxSavedMaps = 500;
const kHighFundsCategoryId = 33;
const kHighFundsFunding = 2000;

// Whether a map page's document shows the High Funds category, or null if it isn't that map's page.
function parseHighFunds(doc, mapsId) {
    if (!doc.querySelector(`a[href*="moveplanner.php?maps_id=${mapsId}"]`)) return null;
    return Array.from(doc.querySelectorAll("#map-categories a[href*='categories_id=']")).some((link) => {
        let id = parseInt(new URL(link.getAttribute("href"), "https://awbw.amarriner.com/").searchParams.get("categories_id"));
        return id === kHighFundsCategoryId || /^high funds$/i.test(link.textContent.trim());
    });
}

function readSavedMaps() {
    return new Promise((resolve) => {
        chrome.storage.local.get([kMapCategoriesStorageKey], (result) => resolve(result?.[kMapCategoriesStorageKey] || {}));
    });
}

async function saveHighFunds(mapsId, highFunds) {
    let saved = await readSavedMaps();
    if (saved[mapsId]?.highFunds === highFunds) return;
    saved[mapsId] = { highFunds, savedAt: Date.now() };
    let ids = Object.keys(saved).sort((lhs, rhs) => saved[rhs].savedAt - saved[lhs].savedAt);
    for (let old of ids.slice(kMaxSavedMaps)) {
        delete saved[old];
    }
    await new Promise((resolve) => chrome.storage.local.set({ [kMapCategoriesStorageKey]: saved }, () => resolve()));
}

// Whether the map is High Funds; false if that couldn't be found out.
async function isHighFundsMap(mapsId) {
    let saved = (await readSavedMaps())[mapsId];
    if (saved) return saved.highFunds;
    try {
        let resp = await fetch(`/prevmaps.php?maps_id=${mapsId}`);
        if (!resp.ok) return false;
        let highFunds = parseHighFunds(new DOMParser().parseFromString(await resp.text(), "text/html"), mapsId);
        if (highFunds === null) return false;
        await saveHighFunds(mapsId, highFunds);
        return highFunds;
    } catch (error) {
        console.warn("[AWBW Enhancements] Couldn't find out whether the map is High Funds:", error);
        return false;
    }
}

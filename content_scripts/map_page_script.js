// Saves whether the map this page shows is High Funds, so the move planner opened from here knows without asking
// AWBW. See lib/map_categories.js.
(function() {
    let mapsId = parseInt(new URLSearchParams(window.location.search).get("maps_id"));
    if (isNaN(mapsId)) return;
    let highFunds = parseHighFunds(document, mapsId);
    if (highFunds !== null) saveHighFunds(mapsId, highFunds);
})();

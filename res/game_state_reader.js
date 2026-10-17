// Runs in the game page's own context (injected by content_scripts/planner_panel_script.js), where AWBW keeps the
// board it's showing as data: unitsInfo, buildingsInfo and playersInfo, updated after every action, in replays too.
// An "awbwe-game-state-request" event on the document is answered, synchronously, with an "awbwe-game-state" event
// whose detail is that data as JSON (or null if it isn't there).
(function () {
    document.addEventListener("awbwe-game-state-request", () => {
        let state = null;
        try {
            if (typeof unitsInfo !== "undefined" && typeof buildingsInfo !== "undefined" && typeof playersInfo !== "undefined") {
                state = JSON.stringify({
                    unitsInfo,
                    buildingsInfo,
                    playersInfo,
                    currentTurn: typeof currentTurn !== "undefined" ? currentTurn : null,
                });
            }
        } catch (error) {
            console.log("[AWBW Enhancements] Couldn't read the game's state:", error);
        }
        document.dispatchEvent(new CustomEvent("awbwe-game-state", { detail: state }));
    });
})();

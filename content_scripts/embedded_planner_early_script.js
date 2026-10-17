// Runs at document_start, before the page is drawn, so that the move planner in the game page's planner panel never
// flashes the site header: marks the page as embedded for res/awbw_enhancements.css. The rest of the embedded
// handling is in embedded_planner_script.js.
(function () {
    if (window.top === window || !window.location.hash.includes("awbwe-embedded")) return;
    document.documentElement.classList.add("awbwe-embedded");

    // AWBW's move planner goes to the previous / next turn with the left and right arrow keys. In the panel they
    // scroll instead (the "Replay:" turn selector still changes turns). Stopped before they reach AWBW's own
    // listener, but not prevented, so the browser still scrolls with them.
    window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.stopImmediatePropagation();
        }
    }, true);
})();

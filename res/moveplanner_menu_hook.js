// Lets the moveplanner quick actions know when a unit's building conversion options are ready.
//
// Opening a unit's menu makes AWBW ask the server about the building under the unit, and AWBW fills in
// #building-options when the reply arrives. Each of those requests is numbered as it's sent, which happens
// synchronously inside the click that opened the menu:
//   data-awbwe-building-info-sent:  the number of the latest request
//   data-awbwe-building-info-ready: set to that number once AWBW has filled in the options for it
// and an "awbwe-building-info" event (detail: the request's number) fires whenever a request completes.
//
// The request is only for those conversion options, so a quick action that opens the menu for something else (set
// HP, wait, move...) sets data-awbwe-skip-building-info around its click, and the request isn't sent: a burst of
// hotkey presses would otherwise send AWBW one request each. The menu's conversion options are cleared instead, as
// AWBW does when its reply arrives, so none left from another unit show.
(function () {
    const jq = window.jQuery;
    if (!jq) {
        console.log("Moveplanner menu hook: jQuery not found, building conversion hotkeys will guess timing.");
        return;
    }

    const kBuildingInfoUrl = "moveplanner_building_info.php";
    let root = document.documentElement;
    let sequence = 0;

    // Aborting in a prefilter stops the request before it's sent, without its done() callbacks or global events.
    jq.ajaxPrefilter((options, originalOptions, jqXHR) => {
        if (!String(options.url).includes(kBuildingInfoUrl) || root.dataset.awbweSkipBuildingInfo === undefined) return;
        let buildingOptions = document.getElementById("building-options");
        if (buildingOptions) buildingOptions.innerHTML = "";
        jqXHR.abort();
    });

    jq(document).ajaxSend((event, jqXHR, settings) => {
        if (!String(settings.url).includes(kBuildingInfoUrl)) return;
        jqXHR.awbweSequence = ++sequence;
        root.dataset.awbweBuildingInfoSent = sequence;
    });

    // jQuery runs a request's own done() callbacks, where AWBW fills in the options, before ajaxComplete.
    jq(document).ajaxComplete((event, jqXHR) => {
        if (!jqXHR.awbweSequence) return;
        if (jqXHR.awbweSequence === sequence) {
            root.dataset.awbweBuildingInfoReady = sequence;
        }
        document.dispatchEvent(new CustomEvent("awbwe-building-info", { detail: String(jqXHR.awbweSequence) }));
    });
})();

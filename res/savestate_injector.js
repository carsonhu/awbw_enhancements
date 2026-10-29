(function () {
    let snapshotElement = document.getElementById("awbw_enhancements-savestate-snapshot");
    if (!snapshotElement) {
        console.log("Couldn't find savestate snapshot element, aborting savestate injector monkey patching.");
        return;
    }

    // The fog image AWBW's server made for each fog array (as JSON), so that restoring snapshots and undoing on a
    // board with fog only asks it once.
    let fogImages = new Map();

    // Tells the content scripts (lib/undo_history.js) once the moveplanner has drawn an injected state. Its own
    // handler is next in line for `loaded`, so this goes after it.
    function announceWhenDrawn(loaded) {
        let announce = () => setTimeout(() => {
            snapshotElement.dispatchEvent(new CustomEvent("awbwe-savestate-loaded"));
        }, 0);
        loaded.then(announce, announce);
        return loaded;
    }

    // Monkey patch axios.post so that we can inject our own snapshot instead when requested.
    let oldPost = axios.post;
    let newPost = function (...args) {
        let [url, data, config] = args;
        console.log("interceptor observed post:", url, data, config);
        if (url === "api/moveplanner/planner_load_state.php") {
            if (snapshotElement.hasAttribute("data")) {
                let snapshotState = JSON.parse(snapshotElement.getAttribute("data"));
                snapshotElement.removeAttribute("data");
                console.log("Found snapshot injection request with state:", snapshotState);

                let fogKey = snapshotState.fogArray ? JSON.stringify(snapshotState.fogArray) : null;
                if (fogKey && fogImages.has(fogKey)) {
                    snapshotState.fogImage = fogImages.get(fogKey);
                } else if (fogKey) {
                    console.log("Detected fog array, querying server for fogImage");

                    var blob = new Blob([JSON.stringify(snapshotState)], { type: 'application/json' });
                    data.set("plannerState", new File([blob], "fake_filename.json"));
                    return announceWhenDrawn(oldPost.call(this, url, data, config).then((res) => {
                        let modifiedState = res.data;
                        if (typeof (modifiedState) == "string") {
                            return res;
                        }

                        fogImages.set(fogKey, modifiedState.fogImage);
                        snapshotState.fogImage = modifiedState.fogImage;
                        return { data: snapshotState };
                    }));
                }
                return announceWhenDrawn(Promise.resolve({ data: snapshotState }));
            } else {
                console.log("No snapshot injection request found, allowing axios.post to proceed.");
            }
        }
        return oldPost.apply(this, args);
    };
    axios.post = newPost;

    // Use a click event listener as a roundabout way of letting the SavestateManager trigger onchange()
    snapshotElement.addEventListener("click", (event) => {
        let lsi = document.getElementById("load-state-input");
        lsi.onchange();
    });
})();

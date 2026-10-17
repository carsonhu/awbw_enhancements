// AWBW's Settings page (userinfo.php): remembers the player's CO portrait style for the moveplanner (see
// ProfileSettingsReader), so the moveplanner doesn't have to fetch this page every time it loads. Saved when the
// page loads, which is after the player saves their settings, and when the settings form is submitted.
(function () {
    function save() {
        let settings = parseProfileSettings(document);
        if (settings) {
            saveProfileSettings(settings);
        }
    }
    save();
    document.querySelector("select[name='cop']")?.form?.addEventListener("submit", save);
})();

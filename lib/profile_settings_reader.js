const kAw1PortraitsPrefix = "terrain/co-portraits/";
const kAw2PortraitsPrefix = "terrain/co-portraits/aw2/";
const kDsPortraitsPrefix = "terrain/co-portraits/ds/";

const kFallbackPortraitPrefix = kDsPortraitsPrefix;

// The player's AWBW profile settings that the extension uses (just the CO portrait style).
//
// They're saved in extension storage whenever the player opens AWBW's Settings page
// (content_scripts/settings_page_script.js), which is the only place they can change, so the Settings page is only
// fetched when nothing has been saved yet.
class ProfileSettingsReader {
    constructor() {
        this.cachedProfileSettings = undefined;
        this.listeners = [];

        this.initialStorageReadPromise = this.readProfileSettingsFromStorage().then((cached) => {
            if (cached[kCachedPortraitsPrefixKey] === undefined) {
                this.startAsyncProfileSettingsFetch();
            }
            return cached;
        });

        // The Settings page may be saved in another tab while this one is open.
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && changes[kCachedPortraitsPrefixKey]?.newValue) {
                this.cachedProfileSettings = { [kCachedPortraitsPrefixKey]: changes[kCachedPortraitsPrefixKey].newValue };
                this.notifyListeners();
            }
        });
    }

    static async instance() {
        let reader = _profileSettingsReaderSingleton;
        await reader.waitForReady();
        return reader;
    }

    async waitForReady() {
        if (this.cachedProfileSettings === undefined) {
            this.cachedProfileSettings = await this.initialStorageReadPromise;
        }
        return "";
    }

    addProfileSettingsUpdateListener(listener) {
        this.listeners.push(listener);
    }

    getCoPortraitsPrefix() {
        return this.cachedProfileSettings?.[kCachedPortraitsPrefixKey] || kFallbackPortraitPrefix;
    }

    readProfileSettingsFromStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get([kCachedPortraitsPrefixKey], (cachedProfileSettings) => {
                console.log("Read cached settings from storage:", cachedProfileSettings);
                resolve(cachedProfileSettings);
            });
        });
    }

    // At most once a day, so that while logged out (when the Settings page can't be read) it isn't fetched on every
    // moveplanner load.
    startAsyncProfileSettingsFetch() {
        const kAttemptKey = "profile_settings_fetch_attempted_at";
        chrome.storage.local.get([kAttemptKey], (result) => {
            if (Date.now() - (result[kAttemptKey] || 0) < 24 * 60 * 60 * 1000) return;
            chrome.storage.local.set({ [kAttemptKey]: Date.now() });
            this.fetchProfileSettingsNow();
        });
    }

    fetchProfileSettingsNow() {
        fetchProfileSettings().then((settings) => {
            // Null when the Settings page couldn't be read (e.g. while logged out): keep using the fallback.
            if (settings) {
                saveProfileSettings(settings);
            }
        }).catch((error) => {
            console.log("Failed to fetch profile settings:", error);
        });
    }

    notifyListeners() {
        for (let listener of this.listeners) {
            listener();
        }
    }
}

let _profileSettingsReaderSingleton = new ProfileSettingsReader();

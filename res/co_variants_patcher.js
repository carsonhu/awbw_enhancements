// Shows the portraits of the 2026 versions of COs in play (e.g. Clone Andy; see lib/co_variants.js) in AWBW's damage
// calculator, which otherwise has the regular CO's. Its damage already follows the version: AWBW's server works it
// out from the game id the calculator sends.
//
// Runs in the page context, after lib/co_variants.js, once content_scripts/co_variants_script.js has found versions.
(function () {
    const variants = window.AwbwCoVariants;
    if (!variants) return;

    function patch() {
        for (let co of window.calculator?.cos || []) {
            let variant = variants.variantForCo(co.co_name);
            if (!variant) continue;
            co.co_image_path = variants.variantPortraitUrl(variant);
            co.co_grayscale_image_path = variants.variantPortraitUrl(variant, true);
        }
    }

    // AWBW fills in calculator.cos with a request once the page's sprites have loaded.
    let start = Date.now();
    let timer = setInterval(() => {
        if (window.calculator?.cos?.length) {
            clearInterval(timer);
            patch();
        } else if (Date.now() - start > 60000) {
            clearInterval(timer);
        }
    }, 250);
})();

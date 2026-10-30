# Firefox Extension Distribution

Releases ship a Firefox `.xpi` signed by Mozilla as a self-distributed (unlisted) add-on: it installs for good in
regular Firefox, isn't listed on addons.mozilla.org, and updates itself from `updates.json` on `main`.

## One-time setup

1. Sign in at [addons.mozilla.org](https://addons.mozilla.org) and create API credentials at
   <https://addons.mozilla.org/en-US/developers/addon/api/key/>.
2. Set them in the terminal you build from (each new terminal needs them again):
   ```powershell
   $env:WEB_EXT_API_KEY = "user:12345:67"
   $env:WEB_EXT_API_SECRET = "..."
   ```
3. Node.js is needed for `web-ext` (fetched with `npx`).

## Each release

1. Bump `version` in `manifests/manifest_common.json` (and `manifest_firefox.json`). Mozilla signs each version once,
   so it has to be new.
2. Run:
   ```powershell
   ./manage.ps1 sign-ff
   ```
   This builds `dist/awbw_enhancements_ff.zip`, has Mozilla sign it (an automated review, usually a few minutes), saves
   `dist/awbw_enhancements_ff.xpi`, and points `updates.json` at that version's release.
3. Commit, tag the commit with the version, and push the tag.
4. Create the GitHub release for the tag with `dist/awbw_enhancements_ff.xpi` (keep that name: the README and
   `updates.json` link to it) and `dist/awbw_enhancements_ff.zip`.
5. Push `main` with the new `updates.json` only once the release has the `.xpi`, since installed copies follow it.

Signing runs Mozilla's linter. To run it first without signing, extract `dist/awbw_enhancements_ff.zip` (from
`./manage.ps1 pack-ff`) to `dist/ff-src` and run `npx web-ext lint --self-hosted --source-dir dist/ff-src`. Its
warnings (mostly `innerHTML`) don't stop signing; errors do.

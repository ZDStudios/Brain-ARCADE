# Brain Arcade — OTA game bundle

This folder holds the live web bundle that the **Brain Arcade** Android app
downloads over WiFi. The app checks `manifest.json` here; when its `version`
differs from what's installed, it downloads every file listed and swaps in the
new games — no reinstall needed. Tablets that are offline keep working with the
copy already on the device.

## Releasing an update

1. Edit / add game files under this `www/` folder.
2. Bump `"version"` in `manifest.json` (e.g. `1.1.0` → `1.1.1`).
3. Make sure every file the app needs is listed in `manifest.json` `"files"`.
4. Commit & push to `main`. Tablets pick it up on their next WiFi check.

> Source of truth for these files lives in the app project
> (`BrainGames/app/src/main/assets/www`) in the `Random-stuff` repo.

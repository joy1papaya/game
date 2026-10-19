# NEON FLUX: Escape the Digital Void

Three-lane neon survival arcade game. Vanilla HTML/CSS/JS + Canvas 2D + Web Audio. No build step, no dependencies, no backend.

## Controls
- Desktop: ← → or A/D change lane · Space uses an ability (Shield first, else Slow) · P/Esc pause · Enter start/restart
- Mobile: tap left/right half of the screen or swipe; use the SHIELD / SLOW buttons

## Mechanics
- Shield costs 40 charge (absorbs one hit, 8 s). Slow costs 60 charge (world at half speed, 4 s). Each fragment adds 8 charge.
- Combo: every 5 consecutive fragments raises the multiplier (max ×5); missing a fragment or taking a hit resets it.
- Near miss: pass an obstacle in an adjacent lane right after switching lanes for bonus points.
- Lane hazards: a flashing magenta strip appears from the horizon; a free lane is always reachable.
- Daily Challenge: obstacle layout seeded from the UTC date (same layout for everyone that day).
- Progress (best, fragments, cores, achievements, settings) is stored in this browser's localStorage only. It does not sync across devices.

## Run locally
1. Open a terminal in the `neon-flux` folder.
2. `python3 -m http.server 8000` (or `npx serve .`), then open http://localhost:8000
   (Double-clicking `index.html` also works.)

## Deploy: GitHub + Vercel
1. Create a GitHub repository (github.com → New repository), e.g. `neon-flux`.
2. Upload every file: `index.html`, `style.css`, `script.js`, `README.md`, `assets/README.md` (use "Add file → Upload files", or `git init && git add . && git commit -m "Initial" && git remote add origin <url> && git push -u origin main`).
3. On vercel.com choose Add New → Project and import the repository.
4. Framework Preset: **Other**. Build command: empty. Output directory: empty (project root). No environment variables.
5. Click Deploy.
6. Open the production URL on desktop and on an Android phone; test menu, lanes, touch, pause, sound, rotate the device, reload to confirm saved progress.
7. To update: commit and push to `main`; Vercel redeploys automatically.

## Google H5 Games Ads readiness checklist
Ads are **disabled by default**; no ad script is loaded and no ad is requested. The only hook is the `Ads` object in `script.js` (`Ads.config.enabled = false`, `Ads.ready = false`), and the rewarded button in the game-over screen stays hidden.
- [ ] Read https://developers.google.com/ad-placement and https://support.google.com/adsense/answer/9959170
- [ ] Have an eligible AdSense account and get approval for H5 Games Ads
- [ ] Host the game on a domain you control and make sure it meets the policies
- [ ] Add the official Ad Placement API tag exactly as Google provides it (only after approval)
- [ ] Implement the official calls inside `Ads.init()` / `Ads.showRewardedContinue()`; set `Ads.ready` only when the API confirms a rewarded placement is available
- [ ] Grant a continue only from the official "ad viewed" callback; never promise an ad or reward
- [ ] Never interrupt active gameplay; confirm the game still works when ads are blocked or declined
- [ ] Do not substitute AdSense display-ad code

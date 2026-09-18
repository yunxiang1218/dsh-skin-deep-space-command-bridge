# Cockpit refinement — implementation and acceptance

Continue the existing independent theme. The user's six detailed requirements authorize this implementation; DSH core, reference skin and native conversation nodes remain intact.

1. Float the three live screens into a shared viewport width budget; drag their title bars using pointer capture and one transform per display frame. Preserve drafts, menus and native dialogs.
2. Remove top/footer decorations. Keep one small corner signature, `yunxiang`, with an expandable source-credit disclosure in the same location.
3. Replace the cockpit artwork with the sharper generated material study; trace its real window boundaries and mask both sides of the canopy/deck seam.
4. Integrate four visually distinct generated astronomical composites with documented user references and official agency sources. Record actual image dimensions without implying upscaling adds detail.
5. After more than five visible seconds in warp, choose uniformly among other scenes, decode before showing, crossfade without black frames, then smoothly return to fast. Pause when hidden and respect reduced motion.
6. Use a continuous speed slider with slow/fast/warp bands; use wheel distance control outside work screens; retain compact look and reset controls.

## Verification

- Unit/lifecycle tests cover real state transitions, cleanup and native editor preservation.
- Isolated DSH host smoke verifies all screens floating together, actual pointer dragging, model/thinking/mode controls, unsent drafts, wheel isolation, scene transitions and plugin disable/re-enable.
- Inspect screenshots at desktop, laptop and narrow widths, near/far camera and side-window boundaries.
- Measure animation cadence and callback/layout cost. A headless throughput result does not establish a physical 144 Hz display guarantee; report the environment and measured limits honestly.

## Historical handoff — 2026-09-17

All six implementation items are present in version 0.3.0. Unit tests (61), seven browser viewport layouts, real DSH controls/lifecycle, repeated scene blends, GPU context recovery and archive contents have been checked. The local archive is `dsh-external-dsh-client-ui-skin-deep-space-command-bridge-0.3.0.tgz`; this work has not published a GitHub release.

The verified real-host profile is `test-results/real-host-O9FXoP`. A standard-vsync headed run, `test-results/headed-host-WcOpMg`, reports about 240 Hz rAF cadence on the local 240 Hz display. One cabin-drag interval reached 8.7 ms, so a strict every-frame 144 fps floor remains unverified. Do not recreate the project or repeat the completed feature work on the next continuation; use `docs/verification-0.3.0.md` and the latest performance traces to continue that remaining acceptance check.

## Initial 0.4.0 handoff — 2026-09-17

The user subsequently requested a slimmer cockpit based on six references, sharper exterior scenery and randomized up/down/left/right travel. These are implemented: v3 cockpit and wall assets, recalibrated screen/window geometry, optional original artistic skies with 4000-pixel photographic skies as default, and a shared smooth two-axis exterior drift. Existing project and native controls remain intact. User accepted the best built-in Image Gen output; no external API or native-4K cockpit generation is pending.

Read `docs/verification-0.4.0.md` and `test-results/real-host-Jwmv6P/report.json` for current evidence. The 4K missing-tile issue was corrected by rasterizing only active/incoming sky layers. Do not recreate these completed features. Strict every-frame 144 fps remains unverified; the newest run has occasional intervals over 6.94 ms. No GitHub publication has occurred.

## Final handoff — 0.4.0, 2026-09-18

The user relaxed performance acceptance to generally smooth normal use, explicitly allowing occasional small stutters. Do not resume an endless every-frame 144 fps optimization goal. No physical 144 fps guarantee is made.

The high-resolution background now decodes in a Worker and uploads small strips to WebGL2, retaining source resolution. Stale quality changes and cancelled uploads are guarded; visible-only progress timeout and GPU failure fall back to decoded CSS scenery. Unit tests: 74 passed. Real GPU pixel checks passed. Final complete isolated runtime: `test-results/real-host-MyuCuB/report.json` (headless hardware Chromium, success=true, no page errors/failed requests). Both photographic/artistic imagery and all native DSH controls passed. See `docs/verification-0.4.0.md` for evidence and historical diagnostic failures.

Local package and preview images are refreshed from this version. The original desktop profile, reference theme and DSH core remain untouched. The user subsequently requested GitHub synchronization on 2026-09-18; use the repository commit/tag and Actions status for publication evidence. Any future request should start from this state, not recreate the project.

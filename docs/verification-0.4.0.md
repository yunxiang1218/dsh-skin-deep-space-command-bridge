# 0.4.0 verification — updated 2026-09-18

This record covers the slim cockpit, high-resolution exterior, random two-axis flight and existing native DSH interactions. DSH core, maid-atelier and the desktop profile were not edited. No model inference request was made. Verification completed locally before the user's subsequent request to synchronize GitHub.

## Final acceptance and current evidence — 2026-09-18

The user explicitly revised the performance requirement: “即使有一点点卡顿也不要紧，不必太过追求完美，基本上不卡顿了就行了”. Acceptance is now normal use that is generally smooth, with occasional minor stutters allowed. A strict every-frame 144 fps floor is not a remaining blocker and is not claimed.

- `npm test`: **74/74 passed**. Six new cases cover cancelled/stale uploads, late initial decode, quality re-selection, visible-only timeout, resource cleanup and successful CSS scene transition after GPU failure.
- `npm run build`: passed; bundled client SHA-256 `457db41e0d918bfd66b4a04115a6fa6f8167e24b8836c5a24128b0c4cdd2c56a`.
- `node tests/space-background.browser.mjs`: passed with real WebGL2 in headless Chromium. Native 4000-pixel test textures retain exact corner colors; a half blend yields the expected pixels. Strip upload, retention, cancellation and context-loss fallback passed. `test-results/space-background/report.json`.
- `node tests/space-particles.browser.mjs`: passed. The test parser now accepts whitespace in browser-serialized transforms; GPU/Canvas heading agreement, context recovery and three pixel-checked scene transitions passed.
- **Final runtime**: `node scripts/host-smoke.mjs --hardware` passed, `test-results/real-host-MyuCuB/report.json`. Headless Chromium / NVIDIA RTX 4090 Laptop / D3D11; WebGL background worker enabled. Native workspace/session/draft, model/thinking/mode, settings, floating/dragging/docking, whole-cabin turning/zoom, six viewport sizes and disable/re-enable all passed. No page errors or failed requests. Desktop and 3840×2160 screenshots were inspected; no missing cockpit tiles were visible.
- Final warp selected a different scene, began fading at 7.067 s after high-resolution preparation, completed at 8.633 s and returned to fast. Five visible seconds precede preparation; the fade takes approximately 1.6 s. Background coverage stayed 1.

| Final headless sample | Duration | rAF p95 | Longest interval | Callback p95 |
| --- | ---: | ---: | ---: | ---: |
| Floating screen drag | 1.021 s | 16.7 ms | 16.8 ms | 0.2 ms |
| Warp and scene fade | 8.635 s | 16.8 ms | 16.8 ms | 0.3 ms |
| Cabin look drag | 2.019 s | 16.8 ms | 16.8 ms | 0.2 ms |

This final correctness run follows the headless browser's roughly 60 Hz clock. It is not a physical-display measurement. Earlier normal-vsync headed samples also establish generally smooth operation: `real-host-kupOPs` measured a 7.159 s warp/fade with a 4.7 ms maximum interval, with an occasional 37.6 ms cabin-drag interval; `real-host-MjXzHs` measured a 7.170 s warp/fade with a 4.8 ms maximum. Its later 5 s camera trace reached 25 ms and is diagnostic only. Those earlier runs precede the final cancellation/timeout safeguards.

### Rendering and reliability changes

`space-background.js` decodes compressed sources and extracts pixels in a Worker. It uploads at most about 512 KiB per display frame without resizing the source photograph; the GPU mixes the current and next sky. CSS photo surfaces are removed from layout while GPU rendering is available. Only current/incoming GPU textures are retained. Unsupported capabilities, worker errors or context loss use decoded CSS images.

Request tokens and worker IDs protect newer quality choices from older preparation tasks. Cancelled uploads settle their promises and release resources. Ten visible seconds without upload progress trigger fallback; hidden pages suspend this timer. `real-host-Ho85wE` previously remained at “正在准备星域”, without captured worker diagnostics. Its exact trigger remains unknown; the timeout is protective, not proof of that trigger. Subsequent complete host runs passed, and the stalled-upload fallback is covered by a deterministic regression test.

Temporary layer-hiding/promotion experiments were not incorporated into the skin. The `real-host-7Vh29N` diagnostic run dropped to approximately 1 Hz after the test window became occluded and timed out locating reset; it is excluded from foreground performance conclusions. `real-host-ZKBeCk` stopped because the temporary A/B script submitted an empty stylesheet. Both temporary A/B paths were removed. No further speculative performance rewrite is pending under the user's revised acceptance.

## Earlier 2026-09-17 verification (historical)

## Artwork and flight

- Cockpit: built-in Image Gen, 1672 × 941; wall material: 1254 × 1254. The user accepted the best output of the existing channel. These are not native 4K assets.
- Exterior defaults to the credited publication JPEGs: 4000 × 2317, 4000 × 2251, 4000 × 3876 and 4000 × 3746. The previous 2172 × 724 artistic panoramas remain selectable in flight controls. Both variants are embedded and decoded before switching.
- Panorama overscan reduced from 10% to 4%; extra scale removed. Random C2-continuous two-axis trajectories stay within ±3% on both axes, independent of the manual cabin camera and destination-selection RNG. GPU and Canvas particles share the same offset.
- Only the active sky is rasterized at rest; only outgoing/incoming skies during a fade. The other decoded images remain cached. This avoids maintaining four full-viewport background raster layers simultaneously.

## Checks

- `npm test`: 68 tests, covering four-way drift, timestep independence, turning continuity, pause/reduced motion, overscan bounds, quality-switch decode/failure/cancellation/disposal, and bounded visible raster layers. Existing lifecycle, draft, model, docking and scene-transition cases remain included.
- `node tests/space-particles.browser.mjs`: passed. Actual WebGL2 compilation, Canvas fallback, context loss/recovery, panorama/GPU heading agreement and three successive pixel-verified crossfades. Report: `test-results/space-particles-hardware/report.json`.
- `node scripts/host-smoke.mjs --hardware --headed`: passed, `test-results/real-host-Jwmv6P/report.json`. Four high-resolution photographs and four artistic panoramas decoded; selector switched successfully. Native workspace, session, unsent draft, model/thinking/mode, settings, three-screen floating/dragging, wheel distance, four-way head turns and disable/re-enable passed. Six viewport sizes: 3840×2160, 1536×960, 1366×768, 1280×960, 768×960 and 390×844; no horizontal overflow or covered editor in the tested geometry.
- Warp selected a different scene after approximately 5.057 seconds, completed at 6.601 seconds and returned to fast. Maximum visible background opacity stayed 1 throughout the blend.
- Final screenshots inspected: desktop, 3840×2160, observation, far cabin, left turn, three floating screens. The earlier 4K cockpit missing-tile artifact was reproduced in `real-host-XWF91Z` and `real-host-Y2VtSn`; the final `real-host-Jwmv6P/host-4k.png` does not show it after reducing concurrently rasterized sky layers. Merely waiting after resize had not resolved it.

## Performance limits

Final host run: NVIDIA RTX 4090 Laptop GPU / ANGLE D3D11 / WebGL2, headed Chromium, normal vsync, no uncapped flags. Interaction samples at 1536×960, device pixel ratio approximately 1:

| Sample | Duration | rAF p95 | Longest interval | Callback p95 |
| --- | ---: | ---: | ---: | ---: |
| Floating screen drag | 0.260 s | 4.3 ms | 4.6 ms | 0.1 ms |
| Warp and scene fade | 6.604 s | 4.3 ms | 29.2 ms | 0.2 ms |
| Cabin look drag | 0.527 s | 4.4 ms | 8.4 ms | 0.2 ms |

Most measured scheduling intervals follow the local high-refresh display, but the longest intervals exceed the 6.94 ms budget of 144 fps. These are browser rAF/callback measurements, not physical presentation measurements; **a strict every-frame minimum of 144 fps remains unverified**. The 4K screenshot validates appearance and layout, not sustained 4K high-refresh performance. The standalone headless particle test runs around 60 Hz and is used for renderer correctness, not a physical high-refresh claim.

No animation or test result is evidence of model response quality; model actions were checked without sending a paid inference request. Local `test-results/` profiles and reports are excluded from archives and Git.

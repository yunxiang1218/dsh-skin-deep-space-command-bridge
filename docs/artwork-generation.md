# Cockpit artwork

The user supplied `docs/design-reference.png` as a visual reference and then requested that seats be omitted because they obscure the view. The source project was retained throughout.

Final asset: `assets/resource/cockpit-frame.png`, 1672×941 PNG.

Generated original: the Image Gen tool's local output file for that session (not distributed with this repository).

The initial frame was edited with OpenAI Image Gen. The final prompt requested photoreal dark metal housings and cyan light strips, removal of all seats, steering controls, hands and headrests, unobstructed upper windows and lower screens, pure black apertures, and no lettering, logos or charts. The intended composition placed the window above the three instrument housings, with a frontal rectangular central screen.

Version 0.2.0 uses the unmodified generated bitmap as a decorative layer. SVG masks reveal one continuous space panorama and star field through all three windows; the windows do not repeat separate backgrounds. There is no planet layer. Slow and fast cruise change the scene's motion, while the extreme setting adds warp trails.

The three screen housings contain live UI. `src/client/screen-docking.js` maps the existing native sidebar and center columns, plus the theme's AI core, to the artwork's screen quadrilaterals with CSS perspective transforms. Each screen has its own float/dock button. The DSH editor, history, model selectors and telemetry are live elements, not pixels from the reference or generated artwork; changing their presentation preserves the native editor and draft.

The observation camera now turns and moves relative to the entire cabin, including the tall window and desk. Four complete room surfaces enclose the cockpit. The native screen homographies are composed with the same camera projection as the artwork, while floated screens keep stable viewport geometry. Native dialogs temporarily flatten their containing screen. The exterior has an independent fixed-depth panorama and travel animation. The environment starts in slow cruise and saves flight/view preferences in browser-local storage.

## 2026-09-15 panorama and cabin material

All three operations used the built-in OpenAI Image Gen tool. No API/CLI fallback was used. These are artistic assets; the default panorama is not a single scientific observation. The original NASA/ESA/CSA photographs remain unchanged and their credits are in `assets/resource/CREDIT.md`.

- `assets/resource/cosmic-panorama.png`: first 2172×724 ultrawide composite. Inputs: original `westerlund2.jpg`, `galaxy.jpg`, `nebula.jpg` in that order. Generated original: `exec-c904b62a-9f8e-4407-9305-da281840e997.png` in the existing Codex generated-images folder.
- `assets/resource/cosmic-horizon.png`: final 1672×941 outpainted 16:9 panorama used by the theme. Generated original: `exec-71dce8ec-bde8-49c4-9eac-57dec39b299c.png`.
- `assets/resource/cabin-titanium.png`: 1254×1254 material applied in world coordinates to both walls, ceiling and floor. Generated original: `exec-82409c9e-3d0b-499f-900b-da5cc59717ff.png`.

The requested ideal 4K dimensions were not produced by the built-in tool; the actual dimensions above are recorded instead. The 4K source observation photos remain available as alternatives.

Composite prompt:

> Create one breathtaking high-resolution ultrawide 3:1 deep-space panorama texture for a realistic starship cockpit's giant panoramic window. COMPOSITING inputs: Image1 is actual NASA/ESA Westerlund2 starcluster and violet/blue glowing dust; Image2 is actual M83 spiral galaxy; Image3 is actual Webb cosmic cliffs. Harmoniously combine the real astrophotographic textures and structures into one coherent artistic fictional cosmic vista, not a collage with visible seams. A complete beautiful spiral galaxy occupies only about 25 percent of overall image width slightly left of center, surrounded by broad dark indigo space, intricate wispy blue/violet nebulosity crossing diagonally into luminous amber dusty cliffs at the far right and lower corners, and small fine colorful stars. Extraordinary depth, fine luminous filaments, varied restrained jewel colors, cinematic photographic contrast, delicate clean starlight. Keep rich detail across ALL left/right/top/bottom edges to support camera movement and cropping. Central region has dark clear space with radiant galaxy structure, not huge washed out white blob. NO planets, no spacecraft, no UI, no frames, no text, no watermark, no fake vignette/black margins, no motion blur or trails (those are animated in code). This is an artistic composite, not a scientific sky map. Wide resolution ideally 3840x1280.

Final panorama edit prompt:

> Edit this artistic astronomical panorama into a high-resolution 16:9 landscape sky texture by OUTPAINTING above and below, preserving the complete original horizontal composition and all three major cosmic structures. Keep the entire existing galaxy, left Westerlund star cluster, and right orange/blue Cosmic Cliffs intact, at smaller scale in the overall new taller frame. Add richly detailed but restrained deep indigo space, fine stars and blue violet filaments above; natural amber and purple dust extensions with dark depth below. The spiral galaxy should be fully seen with its entire arms and take up about 30 percent of the new frame width. Do not zoom into or crop the original. Seamless coherent artistic space panorama, photorealistic astronomical fine detail, no planets, no spacecraft, no frame or labels, no black empty borders, no motion trails. Designed as fullscreen 16:9 starship window background; high quality, ideally 3840x2160.

Cabin material prompt:

> Generate a photorealistic square spaceship interior architectural wall material plate texture, straight-on orthographic view with no perspective. Entire image is filled edge to edge by premium futuristic aerospace titanium gunmetal wall panels, precise machined chamfered edges, intricate dark inset mechanical channels, restrained icy cyan linear light strips, brushed metal highlights, precision screws, small copper heat exchanger slots, dense believable advanced manufacturing details. Match an expensive realistic cinematic spacecraft bridge interior, metallic blue-grey and titanium, sufficient light to clearly see the craft. Four large interlocking manufactured panels with smaller mechanical details integrated within them. No windows, no scenery, no floor, no seat, no cockpit console, no screen, no text or branding. This is a material texture to map onto 3D cabin walls and ceiling around existing realistic cockpit assets. Perfectly fills image with material, no empty borders. Lighting neutral and realistic subtle ambient occlusion, avoid stark black and avoid uniform cheap flat plastic.

## Motion reference and implementation

[StarWars.com Hyperdrive](https://www.starwars.com/databank/hyperdrive) and its official image were consulted for the hyperspace visual reference. No film frames, video or sound are shipped. The animated effect is original canvas code: continuous projected stars, gradient trails, 180 advancing rays with fading recycle boundaries, blue tunnel glow and darkening that smoothly enter/leave according to the flight state. A 0.8 second exponential time constant produces approximately 95% transition after 2.4 seconds, independent of frame rate. Drawing is capped at 30 fps with device pixel ratio capped at 1.75; hidden pages and reduced motion pause it. Parking settles to the static photo instead of freezing bright warp streaks.

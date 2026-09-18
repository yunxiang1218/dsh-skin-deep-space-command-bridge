# Space photographs and cockpit artwork

## Current cockpit artwork (0.4.0, 2026-09-17)

`cockpit-frame-v3.png` and `cabin-titanium-v3.png` were generated with built-in OpenAI Image Gen for this theme. The user's six cockpit references informed the redesign brief: an open panoramic windshield, slim silver outlines, restrained light and a simple curved console, replacing the earlier heavy armour, stacked beams and bolt-heavy detailing. The fifth and sixth user images were supplied to the cockpit generation as aesthetic references; the new cockpit image was then used as the wall-material reference. These are newly generated fictional interior assets, not space-agency photographs or direct edits of a reference photograph.

The generated files are preserved at their actual native dimensions: **1672×941** for the cockpit and **1254×1254** for the wall material. The user chose the best output available through the built-in tool after its resolution limits were explained. No external API fallback or upscaling was used, and these files are not native 4K. Full prompts and returned output paths are recorded in [cockpit-v3-generation.json](cockpit-v3-generation.json); source details, SHA-256 hashes and verification scope are in [the redesign record](../../docs/cockpit-redesign-2026-09-17.md).

## Current four-scene catalog (introduced in 0.3.0)

The active backgrounds and full attribution are documented in [scenes/CREDIT.md](scenes/CREDIT.md). The catalog is [scenes/manifest.json](scenes/manifest.json). Version 0.4.0 defaults to four 4000-pixel-wide publication photographs. The optional artistic mode preserves generated composites based on the user's visual references and credited NASA/ESA/CSA/STScI/ESO imagery; these composites are not telescope observations or accurate sky maps. A single small `yunxiang` disclosure in the interface provides the source credits.

## Previous cockpit artwork (0.3.0)

`cockpit-frame-v2.png` was the version 0.3.0 frame. It is an OpenAI Image Gen edit of the original frame, with the native output preserved at 1672×941. Its aperture geometry was traced from that image; both canopy and deck shared the same mask. This image and the original frame remain in the source repository for provenance; version 0.4.0 uses the v3 artwork above.

## Previous artistic panorama (2026-09-15, version 0.2)

`cosmic-horizon.png` was the version 0.2 default 1672×941 artistic composite generated with OpenAI Image Gen from the original M83, Westerlund 2 and Webb Cosmic Cliffs photographs below. `cosmic-panorama.png` preserves its first ultrawide variant. The images combine and extend observations into a fictional scene; they are **not a single telescope observation or an accurate sky map**. Source attribution remains required. Generation prompts and provenance are in `docs/artwork-generation.md`.

`westerlund2.jpg` is the unmodified 4000×2997 publication JPEG, image `heic1509a`.

Credit: NASA, ESA, the Hubble Heritage Team (STScI/AURA), A. Nota (ESA/STScI), and the Westerlund 2 Science Team.

- [ESA/Hubble source](https://esahubble.org/images/heic1509a/)
- [Publication JPEG](https://cdn.esahubble.org/archives/images/publicationjpg/heic1509a.jpg)
- [Usage terms](https://esahubble.org/copyright/)

The separate `cabin-titanium.png` material is AI-generated spacecraft interior artwork, not a space agency photograph.

## Original galaxy photograph

`galaxy.jpg` is the unchanged 4000×2602 publication JPEG of **Hubble view of barred spiral galaxy Messier 83**, image ID `heic1403a`.

Credit: **NASA, ESA, and the Hubble Heritage Team (STScI/AURA)**. Acknowledgement: William Blair (Johns Hopkins University).

- [Source and image credit](https://esahubble.org/images/heic1403a/)
- [Original publication JPEG](https://cdn.esahubble.org/archives/images/publicationjpg/heic1403a.jpg)
- [ESA/Hubble usage terms](https://esahubble.org/copyright/), Creative Commons Attribution 4.0 International.

Downloaded 14 September 2026. SHA-256: `04E4A546EBE3FC524084AB0D3BE7293F4E5422CF977D2E7D07961E7E5450E757`.
Version 0.2 displayed attribution under the observation window; version 0.3 consolidates active source credits in the corner disclosure. The UI darkens and positions the photo as one continuous panorama shared by three window apertures, with procedural stars and warp trails on a separate layer. There is no planet layer. This is decorative composition, not a scientifically scaled view or endorsement.

## Optional nebula photograph

`nebula.jpg` is the unchanged large JPEG of **Combined NIRCam and MIRI Image of the “Cosmic Cliffs” in Carina**, image ID `weic2205b`, released 12 July 2022.

**Credit: NASA, ESA, CSA, and STScI.**

- [ESA/Webb image and download page](https://esawebb.org/images/weic2205b/)
- [Original large JPEG downloaded for this package](https://cdn.esawebb.org/archives/images/large/weic2205b.jpg)
- [NASA image description](https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-and-miri-composite-image/)
- [ESA/Webb image usage terms](https://esawebb.org/copyright/)

Downloaded 14 September 2026. The resource file has not been cropped, recolored, or otherwise edited. When selected, the interface applies a dark translucent overlay and uses the photo as the shared three-window panorama, with procedural stars and warp trails composed separately. The scene is an artistic interface background, not a scientifically scaled reconstruction or an endorsement by the credited organizations.

Downloaded JPEG SHA-256: `D492DEE517D88764383658C2A129F4C50C774E860C6CA8C202B0C1D2CAFD2C13`.

## Cockpit frame

`cockpit-frame.png` was generated with OpenAI Image Gen for this theme on 14 September 2026, using the user's supplied image as an aesthetic reference. It contains no seats, UI text, logos, or telemetry. It is not NASA/ESA photography. Version 0.2.0 composites the shared exterior through SVG apertures and fits live, independently dockable UI to the three screen housings. Cockpit-distance scaling is applied to the frame and docked UI without changing exterior depth or floating-window size. The final local image and generation prompt are recorded in `docs/artwork-generation.md` in the source project.

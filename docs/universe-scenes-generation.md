# Universe panorama artwork — 16 September 2026

Four new fictional panoramas were generated with the built-in OpenAI Image Gen tool using the user's supplied astronomy photographs in `universe picture/` together with separately downloaded official astronomy photographs. These are artistic composites, not single telescope observations, physically accurate sky maps, or an endorsement by the credited organizations.

## Production and quality

- Each panorama is **2172 × 724 pixels**, a true 3:1 composition. 3840 × 1280 was requested, but 2172 × 724 is the tool's actual native output. No upscaling or false 4K claim is made.
- Every delivered WebP is a **lossless format conversion** of its generated PNG. RGB pixel equality was checked against the original. No crops, recoloring, painted fixes, or post-generation image assembly were used.
- All nine supplied images and all four official references were viewed individually before generation.
- Every generated panorama was inspected at full composition. All four have scenery continuing through both horizontal edges; no cockpit, window frame, foreground planet, text, logo, or UI was generated.
- The panoramas are continuous wide scenes, not repeatable 360-degree textures; do not mirror, tile, or independently position one copy per window.
- Supplied images were left unchanged. Their original files remain in `universe picture/`; they are references, not new redistributed copies in the release resources.
- The generated originals remain at the locations recorded in `assets/resource/scenes/generation-record.json`; production assets are fully copied into the project as lossless WebP.
- That JSON also records each exact prompt, reference path, official source URL, actual dimensions, output size and SHA-256.

## Scene choices

| ID | Display label | Visual character | Supplied reference images |
| --- | --- | --- | --- |
| aurora-reach | 青金云海 | Golden sculpted gas ridges around a transparent cyan nebular cavity; strong depth and fine filaments | universe-04.webp |
| violet-archipelago | 紫蔷薇星系 | Oblique pearl-blue spiral galaxy and separate rose-violet emission-cloud islands | universe-02.webp, universe-07.webp |
| sapphire-veil | 冰蓝尘海 | Cool reflection-cloud ribbon, fractured blue-black dust lanes, distant fine star clusters | universe-09.webp |
| ember-forge | 赤金星炉 | Red emission filaments, amber wind-carved hollow, restrained blue newborn stars | universe-05.webp, universe-08.webp |

## Official source attribution

The full official credit belongs with the artwork, together with a clear statement that the images were artistically composited and extended by AI for yunxiang. The runtime manifest supplies the unshortened source credit and link. A single compact corner attribution area may be used; additional duplicate title/watermark banners are unnecessary.

### 青金云海

- Original image: [NIRCam Image of the Cosmic Cliffs in Carina](https://esawebb.org/images/weic2205a/)
- Credit: **NASA, ESA, CSA, and STScI**
- [Downloaded publication JPEG](https://cdn.esawebb.org/archives/images/publicationjpg/weic2205a.jpg)
- Local unchanged source: `assets/resource/scenes/sources/webb-carina-weic2205a.jpg`
- [Image usage terms](https://esawebb.org/copyright/): Creative Commons Attribution 4.0 International unless otherwise specified on the image page.
- Changes: composition, fictional extension and scene synthesis using OpenAI Image Gen; lossless PNG-to-WebP conversion afterward.

### 紫蔷薇星系

- Original image: [The sharpest view ever of the Triangulum Galaxy](https://esahubble.org/images/heic1901a/)
- Credit: **NASA, ESA, and M. Durbin, J. Dalcanton, and B. F. Williams (University of Washington)**
- [Downloaded publication JPEG](https://cdn.esahubble.org/archives/images/publicationjpg/heic1901a.jpg)
- Local unchanged source: `assets/resource/scenes/sources/hubble-triangulum-heic1901a.jpg`
- [Image usage terms](https://esahubble.org/copyright/): Creative Commons Attribution 4.0 International unless otherwise specified on the image page.
- Changes: composition, fictional extension and scene synthesis using OpenAI Image Gen; lossless PNG-to-WebP conversion afterward.

### 冰蓝尘海

- Original image: [Messier 78: a reflection nebula in Orion](https://www.eso.org/public/images/eso1105a/)
- Credit: **ESO/Igor Chekalin**
- [Downloaded publication JPEG](https://cdn.eso.org/images/publicationjpg/eso1105a.jpg)
- Local unchanged source: `assets/resource/scenes/sources/eso-m78-eso1105a.jpg`
- [Image usage terms](https://www.eso.org/public/outreach/copyright/): Creative Commons Attribution 4.0 International unless otherwise specified on the image page.
- Changes: composition, fictional extension and scene synthesis using OpenAI Image Gen; lossless PNG-to-WebP conversion afterward.

### 赤金星炉

- Original image: [Rho Ophiuchi cloud complex](https://esawebb.org/images/weic2316a/)
- Credit: **NASA, ESA, CSA, STScI, K. Pontoppidan (STScI), A. Pagan (STScI)**
- [Downloaded publication JPEG](https://cdn.esawebb.org/archives/images/publicationjpg/weic2316a.jpg)
- Local unchanged source: `assets/resource/scenes/sources/webb-rho-ophiuchi-weic2316a.jpg`
- [Image usage terms](https://esawebb.org/copyright/): Creative Commons Attribution 4.0 International unless otherwise specified on the image page.
- Changes: composition, fictional extension and scene synthesis using OpenAI Image Gen; lossless PNG-to-WebP conversion afterward.

## User reference provenance

The user supplied the nine WebP files specifically as scene references. Several have visible photographer signatures; the original images and signatures were not modified. The new images are distinct fictional compositions. No ownership or independent reuse license is claimed for the supplied reference photographs, and they are not re-licensed under the project's code MIT license.

## Exact generation prompts

### aurora-reach

Use case: compositing. Create one extraordinary photorealistic cinematic deep-space panorama, 3:1 ultrawide composition, requested output 3840x1280 or the maximum native detail available. Project: Deep Space Command Bridge, viewed continuously through three spacecraft windows, but render ONLY the exterior universe as a single continuous wide vista. Reference 1: supplied Helix Nebula photo, use its transparent turquoise ionized core and copper shell color relationships as inspiration, not its isolated small round object. Reference 2: real Webb Cosmic Cliffs photo, use its breathtaking fine sculpted amber gas ridges and small precise stars as the physical texture language. Recompose and imaginatively extend them into a NEW vast luminous turquoise-and-gold nebular archipelago: flowing gold filament walls along the lower third and far left, turquoise ionized cavities across the center-right, deep midnight-cyan distances, delicate luminous atmospheric layers. A surprising diagonal composition with tiny pin-sharp white and pale gold stars at many apparent distances, sharp microstructure on lit dust filaments, restrained true photographic dynamic range, subtle volumetric depth without fogging everything. Enough textured scenery at both extreme horizontal edges for left/right windows. Major luminous filaments live in the upper two thirds; corners retain subtle detail and stars. Space is enormous and contemplative. Seamless-feeling single camera view, no collage edges or pasted objects. This is fictional composite artwork inspired by astronomical photography, not an accurate observation. NO cockpit, window frames, panels, spacecraft, terrestrial ground, horizons, planets, moons, text, labels, watermark, logos, giant lens flares, cartoon, brush strokes, heavy blur, blown-out white blob, artificial rainbow.

### violet-archipelago

Use case: compositing. Produce one luxurious photorealistic cinematic astronomical panorama with astonishing crisp detail, 3:1 ultrawide horizontal, requested 3840x1280 at maximum native detail. Render only deep space for a continuous three-window spacecraft view, no vehicle or architecture. Reference 1: supplied Triangulum-like spiral galaxy photo provides the delicate loose blue spiral arms, discrete red stellar nurseries, and glowing dispersed core. Reference 2: supplied pink nebula photo provides intricate rose emission filaments and airy translucent gas. Reference 3: Hubble M33 official mosaic provides authentic dense stellar microtexture and subtle brown dust lanes. Combine and entirely recompose these sources into a NEW single continuous fictional panorama. A grand oblique pale pearl and lavender spiral galaxy lies slightly left of center, luminous but not clipped, extending across half the width. Wispy violet and rose nebular islands curl along its outer arms into the right half and both upper corners; vast indigo transparent voids between folds create palpable scale. The galaxy must remain recognizably astronomical, with fine-grained resolved star clouds, sinuous dark dust filaments, very small bright blue clusters and crimson knots, not a smooth whirlpool or synthetic vortex. Fine sharp stars spread naturally to every edge, subtle visual interest at both far sides, soft falloff without flat black areas. Balanced contrast for long viewing, sophisticated limited palette of silver, deep indigo, violet and subdued rose. Extremely realistic telescope-photo texture, no painterly haze. No collage boundaries. NO foreground planet, moon, cockpit, window outline, spacecraft, earthly clouds, water, ground, letters, labels, watermark, logos, graphic symbols, UI, big lens flare, thick star trails, oversaturated rainbow or artificial circular portal. New artwork, not an accurate sky map.

### sapphire-veil

Use case: compositing. Create a breathtaking scientifically inspired photorealistic deep-space environment panorama, 3:1 ultrawide, requested native 3840x1280 or maximum available native resolution. Exterior universe ONLY; it will be one continuous scenery across three cockpit windows, so deliver no cockpit/window/UI at all. Reference 1 supplied dense violet starfield supplies its astonishing star-cluster depth and subtle glowing blue-violet association. Reference 2 ESO Messier 78 reflection nebula supplies finely textured blue reflected light, inky twisting dust lanes, and irregular faint wispy boundaries. Fuse into a completely new expansive icy-blue reflection-nebula vista. A luminous silver-blue cloud ribbon crosses diagonally from lower-left to upper-right, separated into two translucent swaths by intricate charcoal-blue dust rivers; small electric-blue stars ignite tiny regions of the wisps while much more distant pinpoint clusters shimmer through thin veils. Make cooler and quieter than a bright gold nebula or rose spiral galaxy: dominant sapphire, blue-grey, restrained cerulean, rare pale amber stellar points. Deep textured navy voids, never pure featureless black window areas. View feels vast and detailed, not a foggy terrestrial sky. Delicate brittle filaments, wispy silk-like interstellar dust, gradients at several depths, pin-sharp widely varied natural stars, small background galaxies. Meaningful connected scenery extends into far left and right edges. Lightly asymmetric negative space toward center. Natural photographic texture, crisp 4K microcontrast without crunchy sharpening. NO planets, moon, black sphere, bright galactic core, ring, portal, cockpit, window frames, ground, ocean, text, logo, watermark, graphic overlays, giant diffraction spikes, strong vignette, painterly strokes, collage seam. It is beautiful fictional composite art, not a scientifically scaled map.

### ember-forge

Use case: compositing. Generate a premium photorealistic cinematic panoramic universe scene, 3:1 extremely wide format, requested output 3840x1280 at highest native detail. Asset for three continuous spacecraft windows; show ONLY exterior deep space as one coherent vista. Use input 1 supplied Horsehead emission-cloud photograph as reference for the blazing red edge of a deep-dark dust ridge and crisp hot blue stars. Input 2 supplied slender red filament image provides finely braided incandescent gas filaments. Input 3 official Webb Rho Ophiuchi photo provides spectacular sculpted amber stellar-wind cavities, red molecular jets, natural shaded granular dust. Synthesize and extend these into an entirely NEW fictional red-and-amber star-forming region of staggering scale: broad rust-red and burnt-copper clouds sweep across the full width, intricate red filaments surround a softly luminous pale-gold wind-carved hollow near the right third, with dark mahogany dust channels and a few very sharp pale blue newborn stars providing restrained contrast. The clouds are weightless three-dimensional interstellar gas, NOT mountains, flames, lava or an earthly sunset. Design a horizontal river of luminous scarlet edges through the center-upper area, beautifully detailed sides with stars and faint wisps so side windows never read black. Innumerable tiny resolved stars and small restrained diffraction glints. Deep shadows retain fine texture, small highlights stay controlled, photograph-like complexity at close inspection, no broad plastic-looking gradients. Distinct warm palette compared with blue, turquoise and violet scenes. No collage edges. NO cockpit, screens, architecture, planets, spheres, moons, ground, spaceship, black hole, portal, text, watermark, logos, labels, giant lensflare, star trails, illustration brushwork or oversaturated orange fog. Realistic astronomical photographic material transformed into fictional cinematic art, not claimed as actual observation.

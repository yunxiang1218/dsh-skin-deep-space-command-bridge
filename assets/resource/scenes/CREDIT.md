# Four universe scenes: astronomical originals and generated panoramas

Since 0.4.0 the default **高清实景** mode displays the credited publication JPEGs directly, without image enhancement or upscaling. **艺术全景** retains the generated composites below. All images are embedded at build time; no network fetch is required during flight. The animated journey and particle effects are fictional visualization, not astronomical simulation.

| Original photograph | Included file | Actual dimensions |
| --- | --- | --- |
| Webb Carina Nebula | `sources/webb-carina-weic2205a.jpg` | 4000 × 2317 |
| Hubble Triangulum Galaxy | `sources/hubble-triangulum-heic1901a.jpg` | 4000 × 2251 |
| ESO M78 | `sources/eso-m78-eso1105a.jpg` | 4000 × 3876 |
| Webb Rho Ophiuchi | `sources/webb-rho-ophiuchi-weic2316a.jpg` | 4000 × 3746 |

Each original uses the same full credit and source link as its corresponding composite listed below.

These four WebP images are fictional astronomical artworks created for **yunxiang** with built-in OpenAI Image Gen on 16 September 2026, using the user-supplied reference pictures and the official images listed below. They are not telescope observations or accurate sky maps.

- **青金云海** (`aurora-reach.webp`): NASA, ESA, CSA, and STScI. [Source image](https://esawebb.org/images/weic2205a/). Artistically recomposed and extended with AI for yunxiang.
- **紫蔷薇星系** (`violet-archipelago.webp`): NASA, ESA, and M. Durbin, J. Dalcanton, and B. F. Williams (University of Washington). [Source image](https://esahubble.org/images/heic1901a/). Artistically recomposed and extended with AI for yunxiang.
- **冰蓝尘海** (`sapphire-veil.webp`): ESO/Igor Chekalin. [Source image](https://www.eso.org/public/images/eso1105a/). Artistically recomposed and extended with AI for yunxiang.
- **赤金星炉** (`ember-forge.webp`): NASA, ESA, CSA, STScI, K. Pontoppidan (STScI), A. Pagan (STScI). [Source image](https://esawebb.org/images/weic2316a/). Artistically recomposed and extended with AI for yunxiang.

The official source photographs are licensed under CC BY 4.0 as described on [ESA/Webb](https://esawebb.org/copyright/), [ESA/Hubble](https://esahubble.org/copyright/) and [ESO](https://www.eso.org/public/outreach/copyright/). They are not covered by the code's MIT license. Preserve the full source credits when redistributing the artwork and identify the composite modifications.

User reference photographs remain unchanged in `universe picture/`; this project does not claim their copyright. Do not infer a redistribution license for those original user files.

Dimensions: every delivered panorama is 2172 × 724. WebP conversion is lossless; there was no upscaling. Full prompts, actual output paths, source dimensions and SHA-256 values are recorded in `generation-record.json` and `docs/universe-scenes-generation.md`.

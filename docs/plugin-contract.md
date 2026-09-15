# Installed DSH theme contract

Verified from the installed files on 2026-09-14, with implementation notes for Deep Space Command Bridge 0.2.0. Development and validation use isolated profiles; the installed application, original skin, and live profile configuration remain unchanged.

## Actual locations

- Desktop application packages: `%LOCALAPPDATA%\Programs\DSH Desktop\resources\app\node_modules`.
- Desktop DSH home: `%APPDATA%\dsh-desktop\harness`.
- Web profile: `<DSH home>\profiles\web`.
- Reference skin: `<web profile>\node_modules\@dsh-external\dsh-client-ui-skin-maid-atelier`.
- Theme studio: `<web profile>\node_modules\dsh-theme-plugin` (unscoped package).
- CLI: `<application packages>\@deepseek-ai\dsh\lib\bin.js`.
- Bundled Node: `<application packages>\node\bin\node.exe`.
- Running desktop web host was `http://127.0.0.1:43129`; process command uses `--expose-internals`, `harness-node-entry.mjs`, the CLI above, `web --patch <resources>\dsh-desktop.patch.yml --no-open --host 127.0.0.1 --port 43129`.
- Installed official packages report `0.1.2-rc.1`; the reference skin's metadata declares `dshCompatibility: 0.1.5rc2`. Validate against installed code rather than assuming the metadata is a reliable version gate.

## Minimal independent package

The new plugin needs its own package name, loader row ID, module ID, body attribute, and style/node IDs. No inheritance from or edits to the maid skin are needed.

```json
{
  "name": "dsh-client-ui-skin-example",
  "version": "0.2.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json",
    "./skin.json": "./skin.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [] }
  }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: ui-skin-example
      name: dsh-client-ui-skin-example
```

The host entry can simply export `function apply() {}`. The built browser entry must be the host's closure-factory format, not a native ESM import or an ordinary IIFE:

```js
window.__ModuleLoader__.load({
  id: 'dsh-client-ui-skin-example',
  factory: (require) => {
    return {
      apply(ctx) {
        ctx.effect(() => {
          // Install the scoped stylesheet, attributes, nodes and observers.
          return () => { /* Restore every owned write. */ };
        }, 'example: presentation');
      },
    };
  },
});
```

The registered module ID is the **package name**, not the `ui-skin-example` loader row ID. Browser exports may also include `name` and `inject`, e.g. `inject: ['slots', 'theme']` for service consumers. The existing theme studio obtains React with `require('react')`.

`dsh.client.inject` is package-level activation dependency metadata. The theme studio lists `@deepseek-ai/dsh-client-ui-theme` there. `dsh.client.external` lists non-platform modules requested by `require`; the host orders their factories before consumers. Do not list the package itself. `immediately` is optional and defaults to false in the installed host. The existing maid skin uses neither external nor immediately.

Source: official `@deepseek-ai\dsh-client-modules\lib\index.js:139` (validation), `:155` (client export), `:618` (resolution); original `package.json`, `src\index.ts`, `lib\client.js:1`.

## Build and assets

- The original source imports CSS and generated TypeScript constants containing image data URIs. Its published `lib/client.js` embeds all artwork and CSS. Loading the file only registers the factory; CSS and other top-level effects run when the factory materializes.
- The original declares `tsdown && node ../scripts/write-skin-build.mjs . Small-tailqwq/dsh-deep-whale`. Its README explicitly says the distribution omits the build scaffold, and that building is done in the separate `dsh-web-ui` repository. Do not assume running the installed package's build script works.
- A small independent plugin can use a local build script to inline CSS/artwork and emit the same factory wrapper. The host does not require tsdown specifically.
- `skin.json` contains discovery/display metadata: `id`, names, author, description, accent, `bodyAttr`, `package`, `wiring: {id, bundleWired}`, preview paths, and order. `skin.build.json` is the reference skin's build/provenance metadata. Neither file is the official browser loader's entry point.
- The installed official `/plugins` route serves **registered immutable bundle snapshots**, including revisioned combo URLs such as `/plugins/??dsh-client-ui-skin-example/client.js&rev=<revision>`. Use the URL from the boot graph; do not hardcode an arbitrary revision.
- Placing images under a plugin's `assets/` folder does **not** make them available under `/plugins/<package>/assets/`. That route only serves registered bundle responses and their maps; unknown URLs return 404.
- For a browser-only presentation plugin, embed small SVGs/data URIs or include artwork bytes in the bundle. An alternative is an owned host `webServer.register({kind:'exact'|'prefix', path, handler})` route, registered through `ctx.effect`; that adds a host half and requires explicit path validation/MIME handling.
- The SPA static fallback only serves the configured frontend dist directory. Do not copy skin assets into the application's dist directory.

Sources: `dsh-client-modules\lib\index.js:17`, `:183`, `:480`, `:845`; `dsh-host-frontend-static\lib\index.js:40`; `dsh-host-webserver\lib\index.js:176`; original README and generated artwork files.

## Styling, services, and cleanup

The official theme presenter uses `body[data-ds-dark-theme]` for dark mode. Semantic CSS tokens include `--dsw-alias-bg-base`, `--dsw-alias-label-primary`, `--dsw-alias-brand-primary`, `--dsw-specific-sidebar-fill`, `--dsw-specific-input-major`, `--dsw-font-family`, and `--ds-font-family-code`.

Use the official theme service for token overrides when appropriate:

```js
ctx.effect(() => ctx.theme.overrideTokens('dsh-client-ui-skin-example', {
  '--dsw-alias-brand-primary': { light: '#365f92', dark: '#8cb8ef' },
}), 'example: theme tokens');
```

Values must be `{ light, dark }` pairs; plain strings throw. Later override calls win per token. The returned disposer removes only that exact layer and does not remove a newer override under the same source. Capture the disposer so hot-unload restores earlier layers. A source using a new override repeatedly should retain/dispose the latest handle.

For settings UI the installed theme studio uses:

```js
slots.inject('settings.section', () => slots.register(
  { name: 'settings.section', id: 'example-theme', order: 200, label: 'Example' },
  () => React.createElement(SettingsComponent),
));
```

Its host half uses `ctx.inject(['webServer'], hostCtx => hostCtx.effect(() => hostCtx.webServer.tapIndex(html => updatedHtml)))`. `tapIndex` applies after structured index injections and returns a disposer. This is optional for an entirely client-side skin.

For DOM decoration, scope all CSS to the independent body attribute. Save original attribute/property values; remove owned nodes/style elements, disconnect observers, cancel frames/timers, and remove listeners when the Cordis effect disposes. The original's large cleanup block is in `src\client\index.ts:477`; its scope is installed at `:553`.

Sources: `dsh-client-ui-theme\lib\client.js:1353`; `dsh-theme-plugin\client.js` (exports.inject/apply, ThemeStudio, slots); `dsh-theme-plugin\index.js` (apply); `dsh-host-webserver\lib\index.js:219`.

## Registration and isolation

The live web profile currently lists both the maid skin and theme studio in `package.json` dependencies and `dsh.profile.bundles`. Its `cordis.patch.yml` explicitly has `disabled: false` for both `ui-skin-maid-atelier` and `theme-plugin`. A new theme tested alongside both may see conflicting decorative CSS and token overrides. The maid README's separate skin-manager package is not among the profile's three declared dependencies.

The official installer is `dsh plugin --profile web add <absolute local path or package spec>`; removal is `dsh plugin --profile web remove <package name>`. It forwards to pnpm in the profile directory and reconciles `dsh.profile.bundles` based on installed packages declaring `dsh.bundle.patch`. It anchors relative local specs to the invoking directory, but absolute quoted Windows paths remain clearer.

`dsh` is not currently on PATH. Invoke the bundled Node and CLI explicitly and supply the intended `DSH_HOME` in the child process environment. The current shell's home environment must not be presumed to be the desktop home.

Profile layer priority is: bundle patches in listed order, profile `cordis.patch.yml`, home `cordis.patch.yml`, command-line `--patch` overlays, telemetry override. A later patch can disable a known row without deleting or modifying the package. `cordis.yml` is the empty composition root and should not be edited. The live profile has `patchReload: live`; bundle-list/package additions still warrant a restart or isolated fresh boot.

Sources: official `dsh\lib\plugin-F7ZVfRyo.js:8`, `:81`, `:101`; `dsh\lib\profile-boot-BTzzdrGY.js:176`; actual live profile files.

## Validation against the real host

1. Build the new package locally and test its browser factory/apply/disposer in a DOM fixture. Check that activation inserts only owned presentation nodes and deactivation restores attributes, token layers and styles.
2. Launch a separate process using the **installed official CLI/runtime** with a workspace-owned `DSH_HOME`, web profile, separate port and `--no-open --host 127.0.0.1`. Register only the new local package plus the official web/base bundles. This exercises the real module loader and frontend while leaving the user's installed web profile untouched. The CLI can initialize a new web profile when a plugin is added. An isolated home does not carry the user's credentials/sessions.
3. Open that process's own authenticated URL, inspect its boot graph for the new package and actual revisioned bundle URL, and verify no browser/module-load errors. Do not treat a fixture alone as real-host validation.
4. Inspect empty and active conversations, sidebar/settings, dark/light mode, a narrow viewport, a long code block, and a visible message input. Decoration must not cover input, navigation, selection or scrolling. Pure presentation validation needs no model message submission.
5. Reconfigure the isolated profile with the new row disabled, refresh the browser, and verify that the native interface is restored; re-enable the row and refresh again. This validates profile switching across reloads, not client hot-disposal without a reload. The DOM fixture separately checks the effect disposer. An intentional installation into the live desktop profile should use the official add command and an explicit reversible activation patch.

The original read-only inspection found that the live host's unauthenticated root returned HTTP 401, as the official frontend requires browser authentication for index responses. Subsequent tests use the isolated host's own authentication and do not copy credentials or sessions from the desktop profile.

## Current implementation and validation

The theme has 39 passing unit tests and is exercised by `scripts/host-smoke.mjs` in an independent official host. Reports under `test-results/real-host-*/report.json` record real workspace selection, session creation, unsent draft retention, model/Thinking/Agent/Plan changes, settings, pointer controls, three speeds, cockpit distance separated from scenery depth, independent screen docking, responsive layouts from 390 to 1536 pixels, and disable/re-enable with a reload. These checks send no real model inference requests; model selection is not a test of model generation.

`ModelDirectoryResolver.directoryFor()` accesses `remote` and `remote.session` through the calling Cordis context. Merely injecting `modelDirectories` is insufficient: the theme must export both remote service names in `inject` and declare the `@deepseek-ai/dsh-api-remotes` provider package in `dsh.client.inject`. Without these declarations the model panel falsely appeared unavailable even while the native composer displayed a model. The actual-host regression now checks for this failure and exercises both model and reasoning selections.

`src/client/screen-docking.js` decorates the existing AppFrame `sidebarCol` and `centerCol` nodes and the theme-owned AI core. It prepends an owned toolbar without cloning, replacing, or reparenting the native columns. Each screen has an independent floating flag; switching changes only presentation attributes and CSS properties, preserving the editor instance and unsent draft. Disposal removes the toolbars/listeners and restores the attributes and inline properties that existed before activation.

On desktop, `src/client/cockpit-screens.css` keeps `#root` and AppFrame untransformed. Each screen column receives its own `matrix3d` projection from the four artwork corners in `SCREEN_QUADS`; this desktop cockpit geometry replaces the native grid's visible arrangement, and the native column resize handles are hidden in this mode. A floating screen uses a stable viewport rectangle with `transform: none`. At widths of 1000 pixels or below the theme removes the perspective projection and returns the native frame to a grid, with the AI core stacked below it.

When a screen contains a native `[role="dialog"]`, CSS temporarily gives that screen the flat floating geometry, visible overflow, and a higher stacking level. This avoids trapping the dialog in the projected, clipped screen. The native AppFrame `detailsCol` has its own flat fixed-position layer; it is not projected with the center column. Closing these native surfaces restores the corresponding presentation without rebuilding their React content.

`src/client/index.js` composites one space environment behind the three SVG window apertures. `space-environment.js` renders a shared artistic panorama, projected stars and continuous slow/fast/extreme transitions; there is no planet layer. The scenery renderer uses a fixed view. Yaw, pitch and observation distance belong to the entire cabin. `cabin-camera.js` projects the front artwork and the metal side walls/ceiling/floor from one camera; `screen-docking.js` composes the same camera matrix with each monitor's artwork homography. Distance moves both window and console geometry, while floating screens remain in stable viewport coordinates.

The environment defaults to slow cruise and persists mode, speed, yaw, pitch, and distance in the current browser's `localStorage` under `dsc.space.environment.v1`. Individual screen floating flags start docked and are not persisted. Controls start collapsed. Frame-rate independent exponential easing uses a 0.8 second time constant for velocity, panorama movement, trail length, brightness and warp intensity. Parking decelerates and clears warp effects before stopping animation; hidden documents and reduced-motion preferences pause immediately.

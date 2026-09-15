# Installed host: profile disable and browser HMR

Read-only source investigation on 2026-09-14. The installed official DSH packages report `0.1.2-rc.1`. Source paths below are relative to:

`%LOCALAPPDATA%\Programs\DSH Desktop\resources\app\node_modules`

## Finding

The profile patch is correctly shaped. In this installed version, `patchReload: live` updates the **host Loader and the boot graph for subsequent page loads**. It does not automatically reconcile removed or added graph entries in an already-open browser.

The failed assertion in `test-results/real-host-CZB0v1/report.json` waited for the existing page's theme body attribute to disappear after this patch:

```yaml
- id: ui-skin-deep-space-command-bridge
  disabled: true
```

That expectation exceeds the installed browser HMR implementation. The artifact contains no page errors or failed requests; the timeout itself is not evidence that the theme's disposer is defective.

## Verified chain

1. `@deepseek-ai/dsh/lib/profile-boot-BTzzdrGY.js:255` composes live bundle/profile/home/overlay patches. At `:271–287`, `patchReload === 'live'` ensures a Cordis `hmr` service and registers watchers for the profile and home patch files.
2. `@deepseek-ai/dsh-app-boot/lib/index.js:1098` implements `watchUserPatches`. Its `hmr.registerConfig` callback recomposes the patches and calls the root Include entry's `update({config: {...includeConfig, patches}})`.
3. `@deepseek-ai/dsh-client-modules/lib/index.js:462` listens to host `internal/plugin` changes, marks the package dirty, then reconciles the table. At `:767` it excludes entries whose fiber is missing or which are disabled; at `:810` it deletes a package with no remaining active source. At `:485` the index injection handler uses the current composed graph.
4. `@deepseek-ai/dsh-client-hmr/lib/index.js:92–110` responds to `onGraphChanged` only by updating its bundle-file watch list. Its SSE connection sends the current `graph` frame once at `:122–124`. Its broadcast subscription at `:141–149` is **only** `onRebuilt`, producing `rebuilt` frames. There is no graph-change broadcast subscription.
5. Even if a browser reconnects and receives a new graph, `@deepseek-ai/dsh-client-hmr/lib/client.js:93` explicitly implements `case "graph": break;`. The browser HMR driver does not add/remove Loader entries from those graph frames.
6. Browser HMR **does** support replacing an existing rebuilt package: `client.js:65–82` invalidates the module revision, prefetches its new bundle, deletes the old plugin runtime from the Cordis registry, waits for disposal, removes owned styles, refreshes the entry and waits for activation.

The two missing graph-reconciliation steps explain why no error appears while the theme stays on the open page after a host-side disable.

## IDs are not the problem

The named `ui-skin-deep-space-command-bridge` ID belongs to the **host profile row**, and is the correct patch target. The browser receives a package graph and creates its own Loader entries. `@deepseek-ai/dsh-client-hmr/lib/client.js:49` documents that browser tree IDs are random and finds entries using `entry.options.name === packageName`. The different IDs seen in browser diagnostics are expected.

There is no separate skin registry to update for this standalone plugin shape. The original skin's `skin.json` and optional third-party skin-manager contract do not replace the official package/Loader path.

## Correct validation for this version

- Keep the independent plugin in the isolated profile and write the named disabled patch as before.
- Wait until a **fresh authenticated index response** no longer contains the theme package in its boot graph, then reload the test page.
- Assert the new `window.__DSH_BOOT__.entries` omits the package, its body attribute/owned nodes are absent, and the native composer still renders.
- Re-enable the profile row, wait for a fresh index graph containing it, reload, and assert the actual module loader activates the theme again.
- Label this check `disabled/re-enabled with page reload`, not `hot client disposal`.
- Verify the theme's disposer separately in the existing lifecycle test. If real Cordis disposal is required, test an actual rebuilt-bundle revision through the existing browser HMR chain, or operate the browser Loader entry lifecycle from an explicitly test-only harness. A page reload alone does not prove disposer cleanup.

The source investigation did not change the installed runtime or its existing profiles. Runtime verification now passes in `test-results/real-host-kBocOb/report.json`: disabled/re-enabled with page reload, plus native composer availability. Disposer cleanup and draft identity are covered separately by the lifecycle tests.

The desktop's `dsh-desktop-hmr-fallback/index.js` only substitutes the **host config-file watcher** where Node loader internals are unavailable. It does not supply browser graph reconciliation and cannot fix this open-page behavior.

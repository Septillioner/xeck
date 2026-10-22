# Desktop updates through GitHub Releases

Installed Windows NSIS and Linux AppImage builds check the public
`Septillioner/xeck` repository on startup and every four hours. Settings → General →
Application updates also checks manually. Downloading and restarting each require
confirmation. Quitting normally does not install a pending update. If restart is
deferred, the Settings button offers installation of the downloaded update again.

Development builds do not contact the update feed. Stable builds follow stable
releases; prerelease builds can also receive prereleases. Downgrades are disabled.
No GitHub token is embedded in the application: release assets must be public.

## Publish a version

1. Update the root version and lockfile together, for example:
   `npm version 4.4.0-beta.3 --no-git-tag-version`.
2. Commit the changes, then create the matching tag, for example
   `git tag v4.4.0-beta.3`, and push the commit and tag.
3. The Desktop packages workflow checks that the tag matches `package.json`,
   tests the updater, and builds all three platforms. All builds must succeed.
4. It uploads installers, ZIPs, update YAML files and blockmaps into a draft
   release, then publishes it. Tags containing `-` become GitHub prereleases.

Do not delete the YAML files or rename installers after publishing. Their names,
versions and checksums form the update feed. Prefer a new version/tag to replacing
assets on a release users have already installed. The manual package publishing
workflow verifies that its run ID belongs to a successful Desktop packages build
at the exact commit referenced by the version tag. It creates or resumes a draft,
uploads the existing artifacts without rebuilding, then publishes it. Both workflows
refuse to overwrite published releases and serialize work for the same tag. An
interrupted upload can be retried against its draft with the same successful build
run ID. Artifacts are retained for 14 days.

## Build and upload performance

The package jobs cache npm downloads using all four lockfiles, as well as Electron
and electron-builder downloads. The host dependency chain (Poyraz install → build →
host install) runs alongside the web dependency install. Poyraz is built once per
platform; `build:desktop:prepared` builds only host, web and Electron after that
prerequisite. Local `dist:*` commands still build all prerequisites themselves.

Artifact uploads use compression level 0 because installers and ZIPs are already
compressed. Packaging retains its existing compression settings. Release upload
still happens only after every platform succeeds, with write permission confined
to the publishing job. No live release is exposed before its assets finish uploading.

`build.publish` in `package.json` configures the embedded feed. Packaging continues
to use `--publish never`; only the release job uploads files, using GitHub Actions'
repository token with `contents: write`. No personal access token is required.
`generateUpdatesFilesForAllChannels` emits the metadata needed when moving from a
beta to a stable version. macOS ZIPs are included for future signed updates.

## Platform limits and first rollout

- Windows NSIS and Linux AppImage support installation from the app.
- Current macOS builds have signing explicitly disabled in CI. Until Developer ID
  signing and notarization are configured, the Settings button opens Releases for
  manual installation. The app never opens this page automatically on startup.
- Linux DEB installs also open Releases for manual installation; they do not replace
  a package managed by the system package manager through the AppImage updater.
- Existing releases without the updater cannot discover this feature. Users must
  install the first updater-enabled release once manually. Later versions can
  arrive through the new feed.

## Verification

Run `npm run test:updates` and `npm run build:electron`. Updater tests mock Electron
and network operations; they cover trusted IPC, consent, deferred installation,
concurrent checks, unsupported packaging and failed checks.

Before announcing automatic updates, use two real installed versions: install the
first updater-enabled build, publish a higher test version on the same channel,
then verify detection, download, deferred restart and installed version after
restart. Repeat for Windows and AppImage. A source build or mocked test cannot
establish that installers and the live GitHub release feed work end to end.

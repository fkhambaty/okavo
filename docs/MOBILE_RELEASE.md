# Okavo mobile release

Written 14 October 2026. Package and bundle id: `org.okavo.app`. Scheme: `okavo`.

## Checks on this computer

From the repository root, after `npm ci`:

```bash
npm run build -w @okavo/core
npm test -w @okavo/core
npm run typecheck
npm run lint
npm test
npm run build
```

Then the app:

```bash
cd apps/mobile
npm ci
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

`apps/mobile` is not an npm workspace. That keeps React Native off the website install. `@okavo/core` is linked with `file:../../packages/core`, so build the shared package before the mobile typecheck. `npm run typecheck` in `apps/mobile` does that build itself.

CI in `.github/workflows/ci.yml` runs those static checks. It does not build an APK or an iOS simulator app.

## Local release evidence

On 14 October 2026, this source was clean-built with JDK 17 and installed on
the stable Android 16 `CJS_API_36` emulator. The checked
`apps/mobile/maestro/onboarding.yaml` flow passed. A separate cold launch
completed in 1,194 ms, and the captured app log contained no fatal exception or
app ANR. The same APK and Maestro flow passed on the Android 16
`CJS_TABLET_API_36` Pixel Tablet emulator at 2560×1600.

Generated, gitignored outputs:

- `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` —
  99,575,701 bytes; SHA-256
  `36d96a795a788b117f9544628ba36a7a9f825f402bea2ef2a1116868780e3993`
- `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab` —
  70,626,900 bytes; SHA-256
  `f3ec7aad39bf196e5ead183c64fa7c0df30f493c072974b4798ab4db3b8c53f3`

These local release outputs use Expo's generated development signing setup.
They are installation evidence, not Play Store-signed deliverables.

The iOS JavaScript/Hermes export passed. A native iOS Simulator binary was not
produced because this Mac has only Apple Command Line Tools; the owner
cancelled the administrator prompt needed to install full Xcode. Native iPhone
and iPad launch checks remain explicit handoff work after Xcode is installed.

## Run locally

```bash
cd apps/mobile
npx expo start
```

Copy `apps/mobile/env.example` to a local env file only if the API URL should change. The default is `https://okavo-api.fkhambaty.workers.dev`. Do not put a secret in that file. The app reads `EXPO_PUBLIC_OKAVO_API_URL`.

## Icons

`apps/mobile/assets/images` is generated from `brand/okavo-mark-square.png`. The icon and splash use the ink field from that mark. The adaptive icon foreground knocks the black background out so the Android background `#0c0d10` shows through. Regenerate with Pillow from that source if the mark changes. Do not draw a different logo.

## EAS

`apps/mobile/eas.json` has three profiles:

| Profile | What it is for |
|---------|----------------|
| `development` | Dev client, internal, iOS simulator |
| `preview` | Internal APK and iOS simulator |
| `production` | Store distribution, Android App Bundle |

No keystore, Apple password, or token is in the file. EAS credentials stay in the Expo account when a human creates them. `npx eas build` is not part of the local check.

## Account deletion

The Account screen can delete the signed-in account. Store review should use a normal account. Fixture and demo emails are refused. A contract or other shared record is kept, with the name and email removed. Sessions and private files are deleted.

## Store submission later

Do not submit until these exist for real:

- An Apple team and a Play Console app for `org.okavo.app`.
- Hosted `apple-app-site-association` and `assetlinks.json` if `https://okavo.org/app` should open the app. Until then, only `okavo://` links are configured.
- App Store and Play billing if a digital fee will be sold inside the app. The current Razorpay checkout is off and must not be copied into a store product.
- APNs and FCM if phone alerts are required. The in-app list already refreshes in the foreground.

## What this release does not claim

The Android evidence does not substitute for an iOS native run or physical
device testing. Real email delivery, a live identity review, and a real outside
payment remain account tests. Checkout is switched off on purpose.

## New computer

Clone `https://github.com/fkhambaty/okavo`. Install Node 22. Run the checks above. Xcode and an Android SDK are required only when you launch a simulator or build a binary. Signing material is not in git.

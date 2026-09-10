# Fabric mount crash reproducer — React Native 0.86.3

Intermittent `SIGSEGV` in `facebook::react::MountingCoordinator::pullTransaction` during the
**first** Fabric mount commit, about 3 seconds after `ReactNativeJS: Running "main"`, on the
`mqt_v_js` thread.

This repo is the stock `@react-native-community/cli init` template for 0.86.3 with the sample
screen replaced by a plain list, plus one native module (`AsyncStorage`) doing real I/O from a
mount-time `useEffect`.

That native work is the part that matters. **A bare template with no mount-time native work
did not reproduce this** in 40 fresh-install launches with accessibility traversal running —
see the Actions tab. What reproduces it is native module work running concurrently with the
first Fabric mount.

`DEFER_NATIVE_WORK` in `App.tsx` flips the workaround on and off.

## What triggers it

It looks like a race that needs two things at once:

1. **A wide mount window.** A freshly installed app has no dexopt profile, so startup is
   JIT-heavy and the first commit stays in flight longer. An already-installed app starts
   much faster and did not reproduce for us.
2. **Something touching the app during that window.** Either a native module doing real work
   from a mount-time `useEffect`, or an accessibility-tree traversal.

Neither alone reproduced it. Both together did.

## Note on the debug build

`android/app/build.gradle` sets `debuggableVariants = []` so the debug APK bundles its JS
rather than loading it from a Metro packager. Without that, a debug build launched on a
machine with no Metro running never executes any JS — logcat shows *"The packager does not
seem to be running"* and nothing mounts, so the crash cannot occur and the run looks clean.
The workflow now asserts `Running "main"` appears in each launch for that reason.

## Reproduce

Everything runs through GitHub Actions so the emulator and host are reproducible. Go to
**Actions → Reproduce Fabric mount crash → Run workflow**, or run it locally:

```bash
npm ci
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64)

APK=$(find android/app/build/outputs/apk -name '*.apk' | head -1)
adb install -r "$APK"

for i in $(seq 1 40); do
  adb shell am force-stop com.fabricmountrepro
  adb uninstall com.fabricmountrepro >/dev/null 2>&1 || true   # the wide-window condition
  adb install "$APK" >/dev/null
  sleep 2
  adb logcat -c
  adb shell am start -n com.fabricmountrepro/.MainActivity

  # The second trigger. Replace with `sleep 10` to test without it.
  for j in $(seq 1 30); do adb shell uiautomator dump /sdcard/d.xml >/dev/null 2>&1 || true; done

  adb logcat -d | grep -q "Fatal signal 11" && echo "iteration $i CRASH" || echo "iteration $i ok"
done
```

## Environment where it reproduces

| | |
|---|---|
| React Native | 0.86.3 |
| Architecture | New Architecture (bridgeless), Hermes |
| Host | `ubuntu-24.04`, 4-core GitHub-hosted runner |
| Emulator | API 34, `x86_64`, `google_apis`, KVM-accelerated |

`arm64-v8a` reproduces it too, given accessibility traversal — 24 fresh-install launches
*without* traversal did not, which is what made it look arm64-immune at first. Architecture
is not the discriminating variable. API 29 appears rarer than API 34.

## Crash

```
Fatal signal 11 (SIGSEGV), fault addr 0x0 in tid <tid> (mqt_v_js)
ABI: 'x86_64'
Process uptime: 3s

backtrace:
  #00  facebook::react::MountingCoordinator::pullTransaction(bool) const+706
  #01  facebook::react::FabricUIManagerBinding::schedulerDidFinishTransaction(...)+95
  #02  facebook::react::Scheduler::uiManagerDidFinishTransaction(...)+102
  #03  facebook::react::UIManager::shadowTreeDidFinishTransaction(...) const+109
  #04  facebook::react::ShadowTree::mount(facebook::react::ShadowTreeRevision, bool) const+178
  #05  facebook::react::ShadowTree::tryCommit(...) const+1985
  #06  facebook::react::ShadowTree::commit(...) const+206
```

Two fault addresses were seen across runs, `0x0` (`SI_KERNEL`) and `0x4` (`SEGV_MAPERR`),
with the same backtrace otherwise.

## Why this matters beyond CI

Accessibility traversal is one of the two triggers, and TalkBack performs the same traversal.
That makes a user running a screen reader more likely to hit this on their first launch after
installing an app, with nothing they can do about it from their side.

## Measurements

These were taken on a larger application, before this reproducer was extracted. Same APK and
emulator image per row, runs serialised so they saw comparable machine load. "Deferred" means
a mount-time native module call was moved behind `InteractionManager.runAfterInteractions`.

| Fresh install | Mount-time native work | A11y traversal | Crashes |
|---|---|---|---|
| no | yes | no | 0 / 15 |
| no | yes | yes | 0 / 15 |
| yes | yes | no | 2 / 40 |
| yes | deferred | no | 0 / 80 |
| yes | deferred | yes | 2 / 20 |

Results for **this** reproducer are in the Actions tab.

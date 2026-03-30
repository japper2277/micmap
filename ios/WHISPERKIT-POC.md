# WhisperKit Transcription POC

## What's Been Built

### Native iOS (Capacitor Plugin)
- **WhisperTranscriptionPlugin** (`ios/App/App/Plugins/WhisperTranscription/`)
  - `WhisperTranscriptionPlugin.swift` — Capacitor plugin exposing `getStatus()` and `presentRecorder()` to JS
  - `RecorderViewController.swift` — Full native screen: mic permission → record → WhisperKit transcribe → show transcript → copy
  - `TranscriptStorage.swift` — Local persistence via UserDefaults
- **Model**: `openai_whisper-large-v3-v20240930_547MB` (quantized turbo, best quality-to-size ratio)
- **Progress bar** for first-time 547MB model download with MB counter
- **iOS 16.0** minimum deployment target (required by WhisperKit)
- **Info.plist** updated with `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`

### Web Integration
- **"Record Set" button** added to venue modal in `modal.js` (below "Going?" button)
- **Only visible on iOS** — gated by `window.Capacitor` check, invisible on web
- **Purple gradient styling** in `modal.css` (`.btn-record-set`)
- Button in `index.html` (`#modal-record-btn`, hidden by default)

### Xcode Project Changes
- WhisperKit 0.16.0 added as SPM dependency (XCRemoteSwiftPackageReference)
- Plugin Swift files added to App target sources and Plugins group
- Deployment target bumped from iOS 15 → iOS 16 (both project and SPM)

## Files Changed

### iOS (no production impact)
- `ios/App/App/Plugins/WhisperTranscription/WhisperTranscriptionPlugin.swift` — NEW
- `ios/App/App/Plugins/WhisperTranscription/RecorderViewController.swift` — NEW
- `ios/App/App/Plugins/WhisperTranscription/TranscriptStorage.swift` — NEW
- `ios/App/App/AppDelegate.swift` — registers plugin
- `ios/App/App/Info.plist` — mic + speech permissions
- `ios/App/App.xcodeproj/project.pbxproj` — WhisperKit dep, new files, iOS 16
- `ios/App/CapApp-SPM/Package.swift` — iOS 16 platform target

### Web (production — but Record Set button hidden on web)
- `map_designs/newest_map/index.html` — added `#modal-record-btn` (hidden by default)
- `map_designs/newest_map/js/modal.js` — Capacitor-gated Record Set button logic
- `map_designs/newest_map/css/modal.css` — `.btn-record-set` style

## Current State
- POC builds and runs on iPhone via Xcode
- WhisperKit transcription works on device (tested with large-v3 turbo quantized)
- Model downloads on first run (~547MB), cached after that
- Record Set button appears in venue modal on iOS only
- Transcripts saved locally on device
- Production web app unaffected (button hidden without Capacitor)

## What's NOT Built Yet

### Must-have for TestFlight
- [ ] Transcript history screen (list past recordings with date, duration, venue)
- [ ] Share/delete saved transcripts
- [ ] Auto-detect which mic user is at (match GPS to mic data)
- [ ] Upload existing audio file (not just live recording)
- [ ] App icon and launch screen
- [ ] Bump version/build number for TestFlight

### Should-have
- [ ] Better recorder UI (waveform visualization during recording)
- [ ] Attach venue name to transcript automatically
- [ ] "Recap" view in My Night / Tonight's Run (post-show)
- [ ] Transcript editing (let user fix errors)

### Can wait until after TestFlight
- [ ] Cloud sync (transcripts across devices)
- [ ] Full map integration behind feature flag
- [ ] Polished onboarding / first-run experience
- [ ] Android support
- [ ] Speaker diarization (separate multiple speakers)
- [ ] Background recording support

## How to Run
```bash
# Open in Xcode
open ios/App/App.xcodeproj

# Select your iPhone in scheme picker, hit Cmd+R
# First run downloads 547MB model (cached after)
# Open any mic → tap "Record Set" in modal
```

## Architecture
```
JS (modal.js)
  → window.Capacitor.Plugins.WhisperTranscription.presentRecorder()
    → WhisperTranscriptionPlugin.swift (Capacitor bridge)
      → RecorderViewController.swift (native UI)
        → WhisperKit (on-device transcription)
        → TranscriptStorage (UserDefaults)
      → Returns { id, createdAt, durationSec, transcript, language }
    → Toast "Set recorded at [venue]"
```

## Costs
- WhisperKit: **$0** (on-device, no API calls)
- Apple Developer: **$99/year** (required for TestFlight/App Store)
- Model: 547MB one-time download per device, cached locally

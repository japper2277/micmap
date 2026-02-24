# ComedyNYC - Apple App Store Submission Guide

Complete guide to getting your web app on the Apple App Store using Capacitor.

---

## Prerequisites

- [x] Apple Developer Account ($99/year) - https://developer.apple.com
- [ ] Mac with Xcode installed (latest version from App Store)
- [ ] Node.js installed
- [ ] Your app working at https://micfindernyc.netlify.app

---

## Part 1: Prepare Assets

Before writing any code, gather these required assets:

### App Icon
- **Size**: 1024 x 1024 pixels
- **Format**: PNG
- **Requirements**: No transparency, no alpha channel, no rounded corners (Apple adds them)
- **Tool**: Use Figma, Sketch, or https://www.canva.com

### Screenshots (Required)
| Device | Size | Required |
|--------|------|----------|
| iPhone 6.7" (14 Pro Max) | 1290 x 2796 | Yes |
| iPhone 6.5" (11 Pro Max) | 1284 x 2778 | Yes |
| iPhone 5.5" (8 Plus) | 1242 x 2208 | Optional |
| iPad Pro 12.9" | 2048 x 2732 | If supporting iPad |

**Tip**: Use the iOS Simulator in Xcode to take screenshots (Cmd + S)

### App Information
Prepare this text in advance:

```
App Name: ComedyNYC
Subtitle: Find Open Mics Near You (max 30 chars)
Keywords: open mic, comedy, nyc, new york, standup, comedian, stand up, live
Description: (see below)
Support URL: (your website or github)
Privacy Policy URL: (required - can use a free generator)
```

### Sample App Description
```
Find open mics happening tonight across New York City.

ComedyNYC helps comedians find their next stage:

• See what's LIVE NOW - Real-time status shows mics in progress
• Filter by borough, time, and price
• Get transit directions from your location
• Browse day-by-day with the calendar view

From your first open mic to your hundredth, ComedyNYC is your guide to NYC's comedy scene.

Free. No account required.
```

### Privacy Policy
Required even if you don't collect data. Free generators:
- https://www.freeprivacypolicy.com
- https://www.termsfeed.com/privacy-policy-generator/

Host it on:
- A page on your website
- GitHub Gist
- Notion public page

---

## Part 2: Set Up Capacitor

### Step 1: Navigate to your project
```bash
cd /Users/jaredapper/Desktop/micmap/map_designs/newest_map
```

### Step 2: Initialize npm (if not already)
```bash
npm init -y
```

### Step 3: Install Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
```

### Step 4: Initialize Capacitor
```bash
npx cap init "ComedyNYC" com.comedynyc.app --web-dir .
```

**Note**: The bundle ID (`com.comedynyc.app`) must be unique and match what you register in App Store Connect. Use reverse domain notation.

### Step 5: Add iOS Platform
```bash
npx cap add ios
```

This creates an `ios/` folder with your Xcode project.

---

## Part 3: Configure Capacitor

### Edit `capacitor.config.json`

Option A - **Load from your server** (always up-to-date, requires internet):
```json
{
  "appId": "com.comedynyc.app",
  "appName": "ComedyNYC",
  "webDir": ".",
  "server": {
    "url": "https://micfindernyc.netlify.app",
    "cleartext": false
  },
  "ios": {
    "contentInset": "always"
  }
}
```

Option B - **Bundle files locally** (works offline, need to update app for changes):
```json
{
  "appId": "com.comedynyc.app",
  "appName": "ComedyNYC",
  "webDir": ".",
  "ios": {
    "contentInset": "always"
  }
}
```

**Recommendation**: Start with Option A for easier updates, switch to Option B if Apple rejects for being a "web wrapper."

---

## Part 4: Configure iOS Project

### Step 1: Sync your web code
```bash
npx cap sync ios
```

Run this every time you update your web code.

### Step 2: Open in Xcode
```bash
npx cap open ios
```

### Step 3: Configure Signing
1. Click on "App" in the left sidebar (blue icon)
2. Select the "App" target
3. Go to "Signing & Capabilities" tab
4. Check "Automatically manage signing"
5. Select your Team from the dropdown
6. Xcode will create provisioning profiles automatically

### Step 4: Set Deployment Target
1. Still in project settings
2. Set "Minimum Deployments" → iOS 14.0 or higher
3. Set "Devices" → iPhone (or Universal if supporting iPad)

### Step 5: Add App Icons
1. In Xcode, open `App/Assets.xcassets`
2. Click on `AppIcon`
3. Drag your 1024x1024 icon to the "App Store" slot
4. For other sizes, use https://appicon.co to generate all sizes from your 1024px icon
5. Drag generated icons to appropriate slots

### Step 6: Configure Info.plist
Click on `Info.plist` and add these if using location:

| Key | Value |
|-----|-------|
| Privacy - Location When In Use Usage Description | ComedyNYC uses your location to show nearby open mics and calculate transit times. |

### Step 7: Configure Capabilities (if needed)
In Signing & Capabilities, add:
- **Push Notifications** (if you want them later)
- **Background Modes** → Location updates (if tracking in background)

---

## Part 5: Test Your App

### On Simulator
1. In Xcode, select a simulator (e.g., "iPhone 15 Pro")
2. Click the Play button (or Cmd + R)
3. Test all functionality

### On Real Device
1. Connect your iPhone via USB
2. Select your device in Xcode's device dropdown
3. Click Play
4. First time: Trust the developer on your phone (Settings → General → Device Management)

### Take Screenshots
1. Run app in Simulator
2. Navigate to key screens
3. Press Cmd + S to save screenshot
4. Screenshots save to Desktop

---

## Part 6: Build for App Store

### Step 1: Set Build Version
1. In Xcode, select the App target
2. Under "General" tab:
   - Version: `1.0.0`
   - Build: `1`

Increment Build number for each upload. Version changes for user-visible updates.

### Step 2: Select Destination
1. In the scheme dropdown (top of Xcode), select "Any iOS Device (arm64)"

### Step 3: Archive
1. Menu: Product → Archive
2. Wait for build to complete
3. Organizer window opens automatically

### Step 4: Distribute
1. Select your archive in Organizer
2. Click "Distribute App"
3. Select "App Store Connect"
4. Click "Distribute"
5. Choose "Upload" (or "Export" to upload later)
6. Keep all checkboxes default
7. Click "Upload"

Wait for upload to complete (can take 5-15 minutes).

---

## Part 7: App Store Connect

### Step 1: Create App Listing
1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - Platform: iOS
   - Name: ComedyNYC
   - Primary Language: English (U.S.)
   - Bundle ID: Select `com.comedynyc.app`
   - SKU: `comedynyc001` (internal reference, anything unique)

### Step 2: Fill App Information
In the left sidebar, fill out each section:

**App Information**
- Category: Entertainment or Lifestyle
- Content Rights: "This app does not contain third-party content"

**Pricing and Availability**
- Price: Free
- Availability: All countries (or select specific)

**App Privacy**
- Click "Get Started"
- Data Collection: "Yes, we collect data" (if using location)
- Add Location data type → "Functionality" → Not linked to user
- Or "No, we don't collect data" if not using location

### Step 3: Prepare Submission
Under "iOS App" section:

**Version Information**
- Screenshots: Upload for each device size
- Description: Paste your prepared description
- Keywords: Add keywords (100 char limit total)
- Support URL: Your website
- Marketing URL: Optional

**Build**
- Your uploaded build appears here after processing (10-30 min)
- Click "+" to select it

**App Review Information**
- Contact info for Apple reviewers
- Notes: Explain app functionality if needed
- Sign-in required: No (unless your app needs login)

### Step 4: Submit for Review
1. Click "Add for Review" in top right
2. Review all sections (fix any warnings)
3. Click "Submit to App Review"

---

## Part 8: After Submission

### Review Timeline
- **First submission**: 24-72 hours typical
- **Updates**: 24 hours typical
- **Rejections**: Fix issues and resubmit

### Common Rejection Reasons

| Reason | Solution |
|--------|----------|
| "Wrapper app with limited functionality" | Add native features (push notifications, widgets) or bundle locally |
| "Crashes on launch" | Test on real device, check console logs |
| "Incomplete metadata" | Fill all required fields, add screenshots |
| "Placeholder content" | Remove any "lorem ipsum" or test data |
| "Privacy policy missing" | Add privacy policy URL |

### If Rejected
1. Read rejection message in App Store Connect
2. Fix the issues
3. Increment Build number in Xcode
4. Archive and upload again
5. Resubmit for review

---

## Quick Reference Commands

```bash
# Navigate to project
cd /Users/jaredapper/Desktop/micmap/map_designs/newest_map

# Sync web changes to iOS
npx cap sync ios

# Open in Xcode
npx cap open ios

# Update Capacitor
npm update @capacitor/core @capacitor/cli @capacitor/ios

# Check Capacitor doctor
npx cap doctor
```

---

## Checklist

### Before Starting
- [ ] Apple Developer account active
- [ ] Xcode installed and updated
- [ ] Node.js installed

### Assets Ready
- [ ] App icon 1024x1024 PNG
- [ ] Screenshots for iPhone 6.7"
- [ ] Screenshots for iPhone 6.5"
- [ ] App description written
- [ ] Keywords list (under 100 chars)
- [ ] Privacy policy URL
- [ ] Support URL

### Development
- [ ] Capacitor installed
- [ ] iOS platform added
- [ ] Signing configured in Xcode
- [ ] App icons added in Xcode
- [ ] Info.plist permissions added
- [ ] Tested on Simulator
- [ ] Tested on real device

### Submission
- [ ] Build archived
- [ ] Build uploaded to App Store Connect
- [ ] App listing created
- [ ] All metadata filled
- [ ] Screenshots uploaded
- [ ] Build selected
- [ ] Submitted for review

---

## Resources

- [Capacitor iOS Docs](https://capacitorjs.com/docs/ios)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [App Icon Generator](https://appicon.co)
- [Screenshot Generator](https://screenshots.pro)

---

## Updating Your App

After initial release, to push updates:

1. Make changes to web code
2. Update version in Xcode (e.g., 1.0.0 → 1.1.0)
3. Increment build number
4. `npx cap sync ios`
5. Archive and upload
6. In App Store Connect, create new version
7. Add "What's New" text
8. Submit for review

---

Good luck with your submission!

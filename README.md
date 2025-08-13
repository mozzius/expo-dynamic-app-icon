# @mozzius/expo-dynamic-app-icon

> This is a fork of [expo-dynamic-app-icon](https://github.com/outsung/expo-dynamic-app-icon) to support Expo SDK 51+.
> It also includes:
>
> - support for resetting the icon to the default
> - round icon support
> - different icons for Android and iOS

Programmatically change the app icon in Expo.

## Install

```
npx expo install @mozzius/expo-dynamic-app-icon
```

### Set icon file

add plugins in `app.json`

```typescript
 "plugins": [
      [
        "expo-dynamic-app-icon",
        {
          "red": { // icon name
            "ios": "./assets/ios_icon1.png", // icon path for ios
            "android": "./assets/android_icon1.png", // icon path for android
            "prerendered": true // for ios UIPrerenderedIcon option
          },
          "gray": {
            "android": "./assets/icon2.png", // android-only icon
          }
        }
      ]
    ]
```

#### Optional: check AndroidManifest (for android)

After running `expo prebuild`, check the modifications to your `AndroidManifest.xml`. Additional `activity-alias` are added for each icon.

```xml
  ...
    <activity-alias android:name="expo.modules.dynamicappicon.example.MainActivitylight" android:enabled="false" android:exported="true" android:icon="@mipmap/light" android:targetActivity=".MainActivity" android:roundIcon="@mipmap/light_round">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>
    <activity-alias android:name="expo.modules.dynamicappicon.example.MainActivitydark" android:enabled="false" android:exported="true" android:icon="@mipmap/dark" android:targetActivity=".MainActivity" android:roundIcon="@mipmap/dark_round">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>
  </application>
  ...
```

### Create new `expo-dev-client`

Create a new `expo-dev-client` and begin using `expo-dynamic-app-icon`!

### Use `setAppIcon`

- if error, return **false**
- else, return **changed app icon name**
- pass `null` to reset app icon to default

> Note: this causes the app to close on Android, and a popup to appear on iOS

```typescript
import { setAppIcon } from "expo-dynamic-app-icon";

...

setAppIcon("red") // set icon 'assets/icon1.png'
```

### Use `getAppIcon`

get current app icon name

- default return is `DEFAULT`

```typescript
import { getAppIcon } from "expo-dynamic-app-icon";

...

getAppIcon() // get current icon name 'red'
```

Buy outsung (original author) a coffee! I couldn't have done it without his work! 👇

<a href="https://www.buymeacoffee.com/outsung" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

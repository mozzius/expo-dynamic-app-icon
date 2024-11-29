# @mozzius/expo-dynamic-app-icon

> [!NOTE]
> This is a fork of [expo-dynamic-app-icon](https://github.com/outsung/expo-dynamic-app-icon) to support Expo SDK 51.
> It also includes:
>
> - support for resetting the icon to the default
> - round icon support
> - different icons for Android and iOS
> - dynamic icon variants for iOS

Programmatically change the app icon in Expo.

## Install

```
npx expo install @mozzius/expo-dynamic-app-icon
```

## Set icon file

add plugins in `app.json`

```typescript
"plugins": [
  [
    "@mozzius/expo-dynamic-app-icon",
    {
      "red": { // icon name
        "ios": "./assets/ios_icon1.png", // icon path for iOS
        "android": "./assets/android_icon1.png", // icon path for Android
      },
      "gray": {
        "android": "./assets/icon2.png", // Android-only icon
      },
      "dynamic": {
        "ios": { // iOS dynamic icon variants
          "light": "./assets/ios_icon_light.png",
          "dark": "./assets/ios_icon_dark.png",
          "tinted": "./assets/ios_icon_tinted.png",
        },
      }
    }
  ]
]
```

## Check AndroidManifest (for android)

```
expo prebuild
```

check added line
[AndroidManifest.xml](./example/android/app/src/main/AndroidManifest.xml#L33-L44)

```xml
  ...
    <activity-alias android:name="expo.modules.dynamicappicon.example.MainActivityred" android:enabled="false" android:exported="true" android:icon="@mipmap/red" android:targetActivity=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>
    <activity-alias android:name="expo.modules.dynamicappicon.example.MainActivitygray" android:enabled="false" android:exported="true" android:icon="@mipmap/gray" android:targetActivity=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>
  ...
```

## Create new `expo-dev-client`

create a new `expo-dev-client` and begin using `expo-dynamic-app-icon`

## Use `setAppIcon`

- if error, return **false**
- else, return **changed app icon name**
- pass `null` to reset app icon to default

```typescript
import { setAppIcon } from "expo-dynamic-app-icon";

...

setAppIcon("red") // set icon 'assets/icon1.png'
```

## Use `getAppIcon`

get current app icon name

- default return is `DEFAULT`

```typescript
import { getAppIcon } from "expo-dynamic-app-icon";

...

getAppIcon() // get current icon name 'red'
```

Buy outsung (original author) a coffee! I couldn't have dont it without his work! 👇

<a href="https://www.buymeacoffee.com/outsung" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

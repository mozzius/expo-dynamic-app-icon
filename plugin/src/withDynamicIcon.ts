import {
  ExportedConfig,
  ConfigPlugin,
  withDangerousMod,
  withXcodeProject,
  withAndroidManifest,
  AndroidConfig,
} from "expo/config-plugins";
import { generateImageAsync } from "@expo/image-utils";
import fs from "fs";
import path from "path";

const moduleRoot = path.join(__dirname, "..", "..");

const { getMainApplicationOrThrow, getMainActivityOrThrow } =
  AndroidConfig.Manifest;

const ANDROID_FOLDER_PATH = ["app", "src", "main", "res"];
const ANDROID_FOLDER_NAMES = [
  "mipmap-hdpi",
  "mipmap-mdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
];
const ANDROID_SIZES = [162, 108, 216, 324, 432];

/** The default icon folder name to export to */
const IOS_ASSETS_FOLDER_NAME = "Images.xcassets";
/**
 * The default icon dimensions to export.
 *
 * @see https://developer.apple.com/design/human-interface-guidelines/app-icons#iOS-iPadOS-app-icon-sizes
 */
const IOS_ICON_DIMENSIONS: IconDimensions[] = [
  // iPhone, iPad, MacOS
  { scale: 1, size: 1024 },
];

type IconDimensions = {
  /** The scale of the icon itself, affets file name and width/height when omitted. */
  scale: number;
  /** Both width and height of the icon, affects file name only. */
  size: number;
  /** The width, in pixels, of the icon. Generated from `size` + `scale` when omitted */
  width?: number;
  /** The height, in pixels, of the icon. Generated from `size` + `scale` when omitted */
  height?: number;
  /** Special target of the icon dimension, if any */
  target?: null | "ipad";
};

type IconVariant = "light" | "dark" | "tinted";
interface AssetImage {
  filename?: string;
  idiom: "universal";
  platform: "ios";
  size: string;
  appearances?: { appearance: "luminosity"; value: IconVariant }[];
}
type IconSet = Record<string, IconSetProps>;
type IosIconSet = string | { light: string; dark?: string; tinted?: string };
type IconSetProps = {
  ios?: IosIconSet;
  android?: string;
};

type Props = {
  icons: IconSet;
  dimensions: Required<IconDimensions>[];
};

const withDynamicIcon: ConfigPlugin<string[] | IconSet | void> = (
  config,
  props = {}
) => {
  const icons = resolveIcons(props);
  const dimensions = resolveIconDimensions(config);

  config = withGenerateTypes(config, { icons });

  // for ios
  config = withIconXcodeProject(config, { icons, dimensions });
  config = withIconImages(config, { icons, dimensions });

  // for android
  config = withIconAndroidManifest(config, { icons, dimensions });
  config = withIconAndroidImages(config, { icons, dimensions });

  return config;
};

// =============================================================================
//                                   TypeScript
// =============================================================================

function withGenerateTypes(config: ExportedConfig, props: { icons: IconSet }) {
  const names = Object.keys(props.icons);
  const union = names.map((name) => `"${name}"`).join(" | ") || "string";

  const unionType = `IconName: ${union}`;

  const buildFile = path.join(moduleRoot, "build", "types.d.ts");
  const buildFileContent = fs.readFileSync(buildFile, "utf8");
  const updatedContent = buildFileContent.replace(/IconName:\s.*/, unionType);
  fs.writeFileSync(buildFile, updatedContent);

  return config;
}

// =============================================================================
//                                    Android
// =============================================================================

const getSafeResourceName = (name: string) => {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
};

const withIconAndroidManifest: ConfigPlugin<Props> = (config, { icons }) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication: any = getMainApplicationOrThrow(config.modResults);
    const mainActivity = getMainActivityOrThrow(config.modResults);

    const iconNamePrefix = `${config.android!.package}.MainActivity`;
    const iconNames = Object.keys(icons);

    function addIconActivityAlias(config: any[]): any[] {
      return [
        ...config,
        ...iconNames.map((iconKey) => {
          const safeIconKey = getSafeResourceName(iconKey);
          let iconResourceName: string;
          let roundIconResourceName: string;

          iconResourceName = `@mipmap/${safeIconKey}`;
          roundIconResourceName = `@mipmap/${safeIconKey}_round`;

          return {
            $: {
              "android:name": `${iconNamePrefix}${iconKey}`,
              "android:enabled": "false",
              "android:exported": "true",
              "android:icon": iconResourceName,
              "android:targetActivity": ".MainActivity",
              "android:roundIcon": roundIconResourceName,
            },
            "intent-filter": [
              ...(mainActivity["intent-filter"] || [
                {
                  action: [
                    { $: { "android:name": "android.intent.action.MAIN" } },
                  ],
                  category: [
                    {
                      $: { "android:name": "android.intent.category.LAUNCHER" },
                    },
                  ],
                },
              ]),
            ],
          };
        }),
      ];
    }

    function removeIconActivityAlias(currentActivityAliases: any[]): any[] {
      return currentActivityAliases.filter(
        (activityAlias) =>
          !(activityAlias.$["android:name"] as string).startsWith(
            iconNamePrefix
          )
      );
    }

    let activityAliases = mainApplication["activity-alias"] || [];
    activityAliases = removeIconActivityAlias(activityAliases);
    activityAliases = addIconActivityAlias(activityAliases);
    mainApplication["activity-alias"] = activityAliases;

    return config;
  });
};

const withIconAndroidImages: ConfigPlugin<Props> = (config, { icons }) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const androidResPath = path.join(
        config.modRequest.platformProjectRoot,
        ...ANDROID_FOLDER_PATH
      );

      const drawableDirPath = path.join(androidResPath, "drawable");
      const mipmapAnyDpiV26DirPath = path.join(
        androidResPath,
        "mipmap-anydpi-v26"
      );

      // Ensure directories exist
      await fs.promises.mkdir(drawableDirPath, { recursive: true });
      await fs.promises.mkdir(mipmapAnyDpiV26DirPath, { recursive: true });

      const removeIconRes = async () => {
        // Clean up legacy mipmap-*dpi folders
        for (const folderName of ANDROID_FOLDER_NAMES) {
          const folderPath = path.join(androidResPath, folderName);
          const files = await fs.promises.readdir(folderPath).catch(() => []);
          for (const file of files) {
            if (
              !file.startsWith("ic_launcher.") &&
              !file.startsWith("ic_launcher_round.")
            ) {
              const isPluginGenerated = Object.keys(icons).some(
                (iconKey) =>
                  file.startsWith(`${getSafeResourceName(iconKey)}.png`) ||
                  file.startsWith(`${getSafeResourceName(iconKey)}_round.png`)
              );
              if (isPluginGenerated) {
                await fs.promises
                  .rm(path.join(folderPath, file), { force: true })
                  .catch(() => null);
              }
            }
          }
        }
        // Clean up adaptive icon files from drawable and mipmap-anydpi-v26
        // This assumes a naming convention for plugin-generated adaptive icons.
        const drawableFiles = await fs.promises
          .readdir(drawableDirPath)
          .catch(() => []);
        for (const file of drawableFiles) {
          if (
            Object.keys(icons).some((iconKey) =>
              file.startsWith(
                `ic_launcher_adaptive_${getSafeResourceName(iconKey)}_`
              )
            )
          ) {
            await fs.promises
              .rm(path.join(drawableDirPath, file), { force: true })
              .catch(() => null);
          }
        }
        const mipmapAnyDpiFiles = await fs.promises
          .readdir(mipmapAnyDpiV26DirPath)
          .catch(() => []);
        for (const file of mipmapAnyDpiFiles) {
          if (
            Object.keys(icons).some((iconKey) =>
              file.startsWith(
                `ic_launcher_adaptive_${getSafeResourceName(iconKey)}.xml`
              )
            )
          ) {
            await fs.promises
              .rm(path.join(mipmapAnyDpiV26DirPath, file), { force: true })
              .catch(() => null);
          }
        }
      };
      const addIconRes = async () => {
        for (const [iconConfigName, { android }] of Object.entries(icons)) {
          if (!android) continue;
          for (let i = 0; ANDROID_FOLDER_NAMES.length > i; i += 1) {
            const size = ANDROID_SIZES[i];
            const outputPath = path.join(
              androidResPath,
              ANDROID_FOLDER_NAMES[i]
            );
            const safeIconKey = getSafeResourceName(iconConfigName); // Use the same safe name

            // Square ones
            const fileNameSquare = `${safeIconKey}.png`;
            const { source: sourceSquare } = await generateImageAsync(
              {
                projectRoot: config.modRequest.projectRoot,
                cacheType: `expo-dynamic-app-icon-${safeIconKey}-${size}`,
              },
              {
                name: fileNameSquare,
                src: android,
                removeTransparency: true,
                backgroundColor: "#ffffff",
                resizeMode: "cover",
                width: size,
                height: size,
              }
            );
            await fs.promises.writeFile(
              path.join(outputPath, fileNameSquare),
              sourceSquare
            );

            // Round ones
            const fileNameRound = `${safeIconKey}_round.png`;
            const { source: sourceRound } = await generateImageAsync(
              {
                projectRoot: config.modRequest.projectRoot,
                cacheType: `expo-dynamic-app-icon-round-${safeIconKey}-${size}`,
              },
              {
                name: fileNameRound,
                src: android,
                removeTransparency: false,
                resizeMode: "cover",
                width: size,
                height: size,
                borderRadius: size / 2,
              }
            );
            await fs.promises.writeFile(
              path.join(outputPath, fileNameRound),
              sourceRound
            );
          }
        }
      };

      await removeIconRes();
      await addIconRes();

      return config;
    },
  ]);
};

// =============================================================================
//                                   iOS
// =============================================================================

const withIconXcodeProject: ConfigPlugin<Props> = (
  config,
  { icons, dimensions }
) => {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;

    // Remove old settings
    const configurations = project.hash.project.objects["XCBuildConfiguration"];
    for (const id of Object.keys(configurations)) {
      const configuration =
        project.hash.project.objects["XCBuildConfiguration"][id];
      if (typeof configuration !== "object") continue;

      const buildSettings = configuration.buildSettings;
      delete buildSettings["ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES"];
      delete buildSettings["ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS"];
      delete buildSettings["ASSETCATALOG_COMPILER_APPICON_NAME"];
      project.hash.project.objects["XCBuildConfiguration"][id].buildSettings =
        buildSettings;
    }

    // Add new settings
    for (const id of Object.keys(configurations)) {
      const configuration =
        project.hash.project.objects["XCBuildConfiguration"][id];
      if (typeof configuration !== "object") continue;

      const buildSettings = configuration.buildSettings;

      // Include all AppIcon assets
      buildSettings["ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS"] = "YES";

      // Include all alternate AppIcon names
      const names: string[] = [];
      await iterateIconsAndDimensionsAsync(
        { icons, dimensions },
        async (key) => {
          const iconName = getIconName(key);
          names.push(iconName);
        }
      );
      buildSettings["ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES"] =
        JSON.stringify(names.join(" "));

      // Include default icon
      buildSettings["ASSETCATALOG_COMPILER_APPICON_NAME"] = "AppIcon";

      project.hash.project.objects["XCBuildConfiguration"][id].buildSettings =
        buildSettings;
    }

    return config;
  });
};

const withIconImages: ConfigPlugin<Props> = (config, { icons, dimensions }) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName!
      );

      await iterateIconsAndDimensionsAsync(
        { icons, dimensions },
        async (key, { icon, dimension }) => {
          if (!icon.ios) return;

          // Clean the old AppIcon-*.appiconset
          const iconsetPath = path.join(
            IOS_ASSETS_FOLDER_NAME,
            `${getIconName(key)}.appiconset`
          );
          const outputIconsetPath = path.join(iosRoot, iconsetPath);
          await fs.promises
            .rm(outputIconsetPath, {
              recursive: true,
              force: true,
            })
            .catch(() => null);
          await fs.promises.mkdir(outputIconsetPath, { recursive: true });

          // Generate the Contents.json file
          const contents = generateIconsetContents(icon.ios, key, dimension);
          const outputContentsPath = path.join(
            outputIconsetPath,
            "Contents.json"
          );
          await fs.promises.writeFile(
            outputContentsPath,
            JSON.stringify(contents, null, 2)
          );

          const images =
            typeof icon.ios === "string" ? { light: icon.ios } : icon.ios;

          // Generate the assets for each variant
          for (const [variant, icon] of Object.entries(images)) {
            const iconFileName = getIconAssetFileName(
              key,
              variant as IconVariant,
              dimension
            );
            const isTransparent = variant === "dark";
            const { source } = await generateImageAsync(
              {
                projectRoot: config.modRequest.projectRoot,
                cacheType: `expo-dynamic-app-icon-${dimension.width}-${dimension.height}`,
              },
              {
                name: iconFileName,
                src: icon,
                removeTransparency: !isTransparent,
                backgroundColor: isTransparent ? "transparent" : "#ffffff",
                resizeMode: "cover",
                width: dimension.width,
                height: dimension.height,
              }
            );

            const outputAssetPath = path.join(outputIconsetPath, iconFileName);
            await fs.promises.writeFile(outputAssetPath, source);
          }
        }
      );

      return config;
    },
  ]);
};

/** Resolve and sanitize the icon set from config plugin props. */
function resolveIcons(props: string[] | IconSet | void): Props["icons"] {
  let icons: Props["icons"] = {};

  if (Array.isArray(props)) {
    icons = props.reduce(
      (prev, curr, i) => ({ ...prev, [i]: { image: curr } }),
      {}
    );
  } else if (props) {
    icons = props;
  }

  return icons;
}

/** Resolve the required icon dimension/target based on the app config. */
function resolveIconDimensions(
  config: ExportedConfig
): Required<IconDimensions>[] {
  const targets: NonNullable<IconDimensions["target"]>[] = [];

  if (config.ios?.supportsTablet) {
    targets.push("ipad");
  }

  return IOS_ICON_DIMENSIONS.filter(
    ({ target }) => !target || targets.includes(target)
  ).map((dimension) => ({
    ...dimension,
    target: dimension.target ?? null,
    width: dimension.width ?? dimension.size * dimension.scale,
    height: dimension.height ?? dimension.size * dimension.scale,
  }));
}

/** Get the icon name, used to refer to the icon from within the plist */
function getIconName(name: string) {
  return `AppIcon-${name}`;
}

/** Get the icon asset file name */
function getIconAssetFileName(
  key: string,
  variant: IconVariant,
  dimension: Required<IconDimensions>
) {
  const name = `${getIconName(key)}-${variant}`;
  const size = `${dimension.size}x${dimension.size}@${dimension.scale}x`;
  return `${name}-${size}.png`;
}

/** Generate the Contents.json for an icon set */
function generateIconsetContents(
  iconset: IosIconSet,
  key: string,
  dimension: Required<IconDimensions>
) {
  const lightFileName = getIconAssetFileName(key, "light", dimension);
  const images: AssetImage[] = [
    {
      filename: lightFileName,
      idiom: "universal",
      platform: "ios",
      size: `${dimension.size}x${dimension.size}`,
    },
  ];

  if (typeof iconset === "object" && iconset.dark) {
    const darkFileName = getIconAssetFileName(key, "dark", dimension);
    images.push({
      filename: darkFileName,
      idiom: "universal",
      platform: "ios",
      size: `${dimension.size}x${dimension.size}`,
      appearances: [
        {
          appearance: "luminosity",
          value: "dark",
        },
      ],
    });
  } else {
    images.push({
      idiom: "universal",
      platform: "ios",
      size: `${dimension.size}x${dimension.size}`,
      appearances: [
        {
          appearance: "luminosity",
          value: "dark",
        },
      ],
    });
  }

  if (typeof iconset === "object" && iconset.tinted) {
    const tintedFileName = getIconAssetFileName(key, "tinted", dimension);
    images.push({
      filename: tintedFileName,
      idiom: "universal",
      platform: "ios",
      size: `${dimension.size}x${dimension.size}`,
      appearances: [
        {
          appearance: "luminosity",
          value: "tinted",
        },
      ],
    });
  } else {
    images.push({
      idiom: "universal",
      platform: "ios",
      size: `${dimension.size}x${dimension.size}`,
      appearances: [
        {
          appearance: "luminosity",
          value: "tinted",
        },
      ],
    });
  }

  return {
    images,
    info: {
      version: 1,
      author: "expo",
    },
  };
}

/** Iterate all combinations of icons and dimensions to export */
async function iterateIconsAndDimensionsAsync(
  { icons, dimensions }: Props,
  callback: (
    iconKey: string,
    iconAndDimension: {
      icon: Props["icons"][string];
      dimension: Props["dimensions"][0];
    }
  ) => Promise<void>
) {
  for (const [iconKey, icon] of Object.entries(icons)) {
    for (const dimension of dimensions) {
      await callback(iconKey, { icon, dimension });
    }
  }
}

export default withDynamicIcon;

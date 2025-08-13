import {
  ExportedConfig,
  ConfigPlugin,
  IOSConfig,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  withAndroidManifest,
  AndroidConfig,
} from "expo/config-plugins";
import { generateImageAsync } from "@expo/image-utils";
import fs from "fs";
import path from "path";
// @ts-ignore - no types
import pbxFile from "xcode/lib/pbxFile";

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
const IOS_FOLDER_NAME = "DynamicAppIcons";
/**
 * The default icon dimensions to export.
 *
 * @see https://developer.apple.com/design/human-interface-guidelines/app-icons#iOS-iPadOS-app-icon-sizes
 */
const IOS_ICON_DIMENSIONS: IconDimensions[] = [
  // iPhone, iPad, MacOS, ...
  { scale: 2, size: 60 },
  { scale: 3, size: 60 },
  // iPad only
  { scale: 2, size: 60, width: 152, height: 152, target: "ipad" },
  { scale: 3, size: 60, width: 167, height: 167, target: "ipad" },
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

type IconSet = Record<string, IconSetProps>;
type IconSetProps = { ios?: string; android?: string; prerendered?: boolean };

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
  config = withIconInfoPlist(config, { icons, dimensions });
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
    const groupPath = `${config.modRequest.projectName!}/${IOS_FOLDER_NAME}`;
    const group = IOSConfig.XcodeUtils.ensureGroupRecursively(
      config.modResults,
      groupPath
    );
    const project = config.modResults;
    const opt: any = {};

    // Unlink old assets

    const groupId = Object.keys(project.hash.project.objects["PBXGroup"]).find(
      (id) => {
        const _group = project.hash.project.objects["PBXGroup"][id];
        return _group.name === group.name;
      }
    );
    if (!project.hash.project.objects["PBXVariantGroup"]) {
      project.hash.project.objects["PBXVariantGroup"] = {};
    }
    const variantGroupId = Object.keys(
      project.hash.project.objects["PBXVariantGroup"]
    ).find((id) => {
      const _group = project.hash.project.objects["PBXVariantGroup"][id];
      return _group.name === group.name;
    });

    const children = [...(group.children || [])];

    for (const child of children as {
      comment: string;
      value: string;
    }[]) {
      const file = new pbxFile(path.join(group.name, child.comment), opt);
      file.target = opt ? opt.target : undefined;

      project.removeFromPbxBuildFileSection(file); // PBXBuildFile
      project.removeFromPbxFileReferenceSection(file); // PBXFileReference
      if (group) {
        if (groupId) {
          project.removeFromPbxGroup(file, groupId); //Group other than Resources (i.e. 'splash')
        } else if (variantGroupId) {
          project.removeFromPbxVariantGroup(file, variantGroupId); // PBXVariantGroup
        }
      }
      project.removeFromPbxResourcesBuildPhase(file); // PBXResourcesBuildPhase
    }

    // Link new assets

    await iterateIconsAndDimensionsAsync(
      { icons, dimensions },
      async (key, { dimension }) => {
        const iconFileName = getIconFileName(key, dimension);

        if (
          !group?.children.some(
            ({ comment }: { comment: string }) => comment === iconFileName
          )
        ) {
          // Only write the file if it doesn't already exist.
          config.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
            filepath: path.join(groupPath, iconFileName),
            groupName: groupPath,
            project: config.modResults,
            isBuildFile: true,
            verbose: true,
          });
        } else {
          console.log("Skipping duplicate: ", iconFileName);
        }
      }
    );

    return config;
  });
};

const withIconInfoPlist: ConfigPlugin<Props> = (
  config,
  { icons, dimensions }
) => {
  return withInfoPlist(config, async (config) => {
    const altIcons: Record<
      string,
      { CFBundleIconFiles: string[]; UIPrerenderedIcon: boolean }
    > = {};

    const altIconsByTarget: Partial<
      Record<NonNullable<IconDimensions["target"]>, typeof altIcons>
    > = {};

    await iterateIconsAndDimensionsAsync(
      { icons, dimensions },
      async (key, { icon, dimension }) => {
        if (!icon.ios) return;
        const plistItem = {
          CFBundleIconFiles: [
            // Must be a file path relative to the source root (not a icon set it seems).
            // i.e. `Bacon-Icon-60x60` when the image is `ios/somn/appIcons/Bacon-Icon-60x60@2x.png`
            getIconName(key, dimension),
          ],
          UIPrerenderedIcon: !!icon.prerendered,
        };

        if (dimension.target) {
          altIconsByTarget[dimension.target] =
            altIconsByTarget[dimension.target] || {};
          altIconsByTarget[dimension.target]![key] = plistItem;
        } else {
          altIcons[key] = plistItem;
        }
      }
    );

    function applyToPlist(key: string, icons: typeof altIcons) {
      if (
        typeof config.modResults[key] !== "object" ||
        Array.isArray(config.modResults[key]) ||
        !config.modResults[key]
      ) {
        config.modResults[key] = {};
      }

      // @ts-ignore
      config.modResults[key].CFBundleAlternateIcons = icons;

      // @ts-ignore
      config.modResults[key].CFBundlePrimaryIcon = {
        CFBundleIconFiles: ["AppIcon"],
      };
    }

    // Apply for general phone support
    applyToPlist("CFBundleIcons", altIcons);

    // Apply for each target, like iPad
    for (const [target, icons] of Object.entries(altIconsByTarget)) {
      if (Object.keys(icons).length > 0) {
        applyToPlist(`CFBundleIcons~${target}`, icons);
      }
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

      // Delete all existing assets
      await fs.promises
        .rm(path.join(iosRoot, IOS_FOLDER_NAME), {
          recursive: true,
          force: true,
        })
        .catch(() => null);

      // Ensure directory exists
      await fs.promises.mkdir(path.join(iosRoot, IOS_FOLDER_NAME), {
        recursive: true,
      });

      // Generate new assets
      await iterateIconsAndDimensionsAsync(
        { icons, dimensions },
        async (key, { icon, dimension }) => {
          if (!icon.ios) return;
          const iconFileName = getIconFileName(key, dimension);
          const fileName = path.join(IOS_FOLDER_NAME, iconFileName);
          const outputPath = path.join(iosRoot, fileName);

          const { source } = await generateImageAsync(
            {
              projectRoot: config.modRequest.projectRoot,
              cacheType: `expo-dynamic-app-icon-${dimension.width}-${dimension.height}`,
            },
            {
              name: iconFileName,
              src: icon.ios,
              removeTransparency: true,
              backgroundColor: "#ffffff",
              resizeMode: "cover",
              width: dimension.width,
              height: dimension.height,
            }
          );

          await fs.promises.writeFile(outputPath, source);
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
function resolveIconDimensions(config: ExportedConfig): Required<IconDimensions>[] {
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
function getIconName(name: string, dimension: Props["dimensions"][0]) {
  return `${name}-Icon-${dimension.size}x${dimension.size}`;
}

/** Get the full icon file name, including scale and possible target, used to write each exported icon to */
function getIconFileName(name: string, dimension: Props["dimensions"][0]) {
  const target = dimension.target ? `~${dimension.target}` : "";
  return `${getIconName(name, dimension)}@${dimension.scale}x${target}.png`;
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

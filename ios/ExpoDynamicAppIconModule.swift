import ExpoModulesCore

public class ExpoDynamicAppIconModule: Module {
  public func definition() -> ModuleDefinition {

    Name("ExpoDynamicAppIcon")

    Function("setAppIcon") { (name: String?) -> String in
      self.setAppIcon(name)

      // Return "DEFAULT" if name is nil or empty
      return name ?? "DEFAULT"
    }

    Function("getAppIcon") { () -> String in
      // Return the current alternate icon name or "DEFAULT" if none is set
      let iconName = UIApplication.shared.alternateIconName
      return iconName?.replacingOccurrences(of: "AppIcon-", with: "") ?? "DEFAULT"
    }
  }

  private func setAppIcon(_ iconName: String?) {
    if UIApplication.shared.responds(to: #selector(getter: UIApplication.supportsAlternateIcons))
      && UIApplication.shared.supportsAlternateIcons
    {
      var iconNameToUse: String? = nil  // If the icon name is nil or empty, reset to default
      if let iconName = iconName, !iconName.isEmpty {
        iconNameToUse = "AppIcon-\(iconName)"
      }

      // Set the alternate icon or reset to the default icon
      UIApplication.shared.setAlternateIconName(
        iconNameToUse,
        completionHandler: { error in
          if let error = error {
            // Handle error if necessary
            print("Failed to set app icon: \(error.localizedDescription)")
          }
        })
    }
  }
}

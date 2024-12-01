import { Button, Text, View } from "react-native";

import {
  getAppIcon,
  IconName,
  setAppIcon,
} from "@mozzius/expo-dynamic-app-icon";
import { useState } from "react";

export default function App() {
  const [iconName, setIconName] = useState<IconName | "DEFAULT">();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ marginBottom: 16 }}>
        <Button title="get icon!" onPress={() => setIconName(getAppIcon())} />
        <Text>{iconName || "Press Button!"}</Text>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Button
          title="change default icon"
          onPress={() => console.log(setAppIcon(null))}
        />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Button
          title="change light icon"
          onPress={() => console.log(setAppIcon("light"))}
        />
      </View>

      <Button
        title="change dark icon"
        onPress={() => console.log(setAppIcon("dark"))}
      />
    </View>
  );
}

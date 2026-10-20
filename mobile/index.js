// App entry (package.json "main"). Expo Router as before, plus the Zorka bubble's headless task: the native bubble
// (modules/zorka-overlay) starts "ZorkaAssistant" for every turn and every tap on its card, with or without the app open.
import "expo-router/entry";
import { AppRegistry } from "react-native";

import { overlayTask } from "./src/features/assistant/overlayTask";

AppRegistry.registerHeadlessTask("ZorkaAssistant", () => overlayTask);

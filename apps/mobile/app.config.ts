import { APP_NAME } from "@care/shared/constants";

const config = {
  expo: {
    name: APP_NAME,
    slug: "hale-care",
    scheme: "hale",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: [
      "expo-router",
      "@clerk/expo",
      ["expo-av", { microphonePermission: `${APP_NAME} uses your microphone so you can speak with your assistant.` }],
      "expo-secure-store",
    ],
    experiments: { typedRoutes: true },
    ios: { supportsTablet: false },
    android: { adaptiveIcon: { backgroundColor: "#e8f3f1" } },
  },
};

export default config;

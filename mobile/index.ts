// Entry point: the background task is defined first (it may run without any screen), then the
// screens of Expo Router.
import "./src/platform/background.ts";
import "expo-router/entry";

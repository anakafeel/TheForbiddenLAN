/**
 * react-native.config.js
 *
 * Exclude react-native-reanimated from autolinking.
 *
 * Why: @react-navigation/bottom-tabs v7 declares react-native-reanimated as a
 * peer dependency, so pnpm installs it even though we don't use it directly.
 * The installed version (3.17.x) fails to compile against React Native 0.81.5
 * because TRACE_TAG_REACT_JAVA_BRIDGE and LengthPercentage.resolve() were
 * removed. Excluding it from autolinking stops Gradle from compiling it.
 */
module.exports = {
  dependencies: {
    'react-native-reanimated': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};

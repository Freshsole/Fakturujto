import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

export default function App() {
  const webUrl = useMemo(() => {
    if (process.env.EXPO_PUBLIC_WEB_URL) return process.env.EXPO_PUBLIC_WEB_URL;
    return Platform.OS === "android" ? "http://10.0.2.2:5173" : "http://127.0.0.1:5173";
  }, []);

  const [loading, setLoading] = useState(true);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {loading && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#71008c" />
          <Text style={styles.loaderText}>Načítám Fakturaci…</Text>
        </View>
      )}
      <WebView
        source={{ uri: webUrl }}
        style={styles.web}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        allowsBackForwardNavigationGestures
        mixedContentMode="always"
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fbf9fc" },
  web: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fbf9fc",
    zIndex: 1,
  },
  loaderText: { marginTop: 12, fontSize: 14, color: "#504251" },
});

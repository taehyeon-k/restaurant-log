import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";

export default function HomeScreen() {
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    async function test() {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .limit(1);

      if (error) {
        setStatus(`Supabase response: ${error.message}`);
        return;
      }

      setStatus(
        data?.length
          ? `Connected: ${data[0].name}`
          : "Connected, but no visible rows"
      );
    }

    test();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>DINARY</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f3ec",
    padding: 24,
  },
  logo: {
    fontSize: 40,
    fontWeight: "700",
    color: "#1c1a17",
  },
  status: {
    marginTop: 18,
    fontSize: 14,
    color: "#8a8377",
    textAlign: "center",
  },
});
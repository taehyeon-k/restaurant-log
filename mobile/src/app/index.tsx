import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setRestaurantName(null);
      return;
    }

    async function loadRestaurant() {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .limit(1);

      if (error) {
        setError(error.message);
        return;
      }

      setRestaurantName(data?.[0]?.name ?? "No restaurant records");
    }

    loadRestaurant();
  }, [session]);

  async function signInWithGoogle() {
    setError(null);

    const redirectTo = `${window.location.origin}/`;

    console.log("OAuth redirectTo:", redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    console.log("OAuth response:", data, error);

    if (error) {
      setError(error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRestaurantName(null);
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>DINARY</Text>
        <Text style={styles.subtitle}>
          다이닝에 다이어리를 더하다
        </Text>

        <Pressable style={styles.button} onPress={signInWithGoogle}>
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>DINARY</Text>

      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>
        {session.user.email ?? session.user.id}
      </Text>

      <Text style={styles.label}>Your restaurant</Text>
      <Text style={styles.restaurant}>
        {restaurantName ?? "Loading..."}
      </Text>

      <Pressable style={styles.secondaryButton} onPress={signOut}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f6f3ec",
  },

  logo: {
    fontSize: 44,
    fontWeight: "700",
    color: "#1c1a17",
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 32,
    fontSize: 15,
    color: "#8a8377",
  },

  button: {
    minWidth: 240,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#b4552d",
    alignItems: "center",
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },

  label: {
    marginTop: 24,
    fontSize: 13,
    color: "#8a8377",
  },

  email: {
    marginTop: 6,
    fontSize: 16,
    color: "#1c1a17",
  },

  restaurant: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "600",
    color: "#1c1a17",
  },

  secondaryButton: {
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b4552d",
  },

  secondaryButtonText: {
    color: "#b4552d",
    fontWeight: "600",
  },

  error: {
    marginTop: 20,
    color: "#b42318",
    textAlign: "center",
  },
});
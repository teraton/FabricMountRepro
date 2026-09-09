/**
 * Minimal reproducer for an intermittent SIGSEGV in
 * facebook::react::MountingCoordinator::pullTransaction during the first Fabric mount.
 *
 * This is the stock `@react-native-community/cli init` template for 0.86.3, with:
 *   - the sample screen replaced by a plain list, and
 *   - a native module (AsyncStorage) doing real I/O from a mount-time `useEffect`.
 *
 * The native work is the part that matters. A bare template with no mount-time native work
 * did NOT reproduce this in 40 fresh-install launches with accessibility traversal running
 * (see README). Adding native I/O concurrent with the first mount is what reproduces it.
 *
 * `DEFER_NATIVE_WORK` flips the workaround: when true, the same work is moved behind
 * `InteractionManager.runAfterInteractions` so the first commit completes before it starts.
 */
import { useEffect, useState } from 'react';
import {
  InteractionManager,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Set true to apply the workaround. Left false so a default checkout reproduces the bug.
 * Building both ways is how the two rows in the README's results table were produced.
 */
const DEFER_NATIVE_WORK = false;

const ROWS = Array.from({ length: 40 }, (_, index) => `Row ${index + 1}`);

/**
 * Stands in for whatever real native work an app does at startup — opening a database,
 * reading a cache, restoring session state. The volume matters only in that it has to still
 * be running while the first mount commits.
 */
async function doNativeWork(): Promise<number> {
  const entries: [string, string][] = Array.from({ length: 200 }, (_, index) => [
    `key-${index}`,
    JSON.stringify({ index, payload: 'x'.repeat(128) }),
  ]);
  await AsyncStorage.multiSet(entries);
  const read = await AsyncStorage.multiGet(entries.map(([key]) => key));
  return read.length;
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      doNativeWork().then(count => {
        if (!cancelled) setLoaded(count);
      });
    };

    if (DEFER_NATIVE_WORK) {
      const handle = InteractionManager.runAfterInteractions(run);
      return () => {
        cancelled = true;
        handle.cancel();
      };
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]} testID="app-root">
      <Text style={styles.title} testID="header">
        Fabric mount repro
      </Text>
      <Text testID="status">
        {loaded === null ? 'loading' : `loaded ${loaded} entries`}
      </Text>
      {ROWS.map(row => (
        <View key={row} style={styles.row} testID={`row-${row}`}>
          <Text style={styles.rowText}>{row}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    marginBottom: 4,
  },
  rowText: { fontSize: 14 },
});

export default App;

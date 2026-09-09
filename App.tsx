/**
 * Minimal reproducer for an intermittent SIGSEGV in
 * facebook::react::MountingCoordinator::pullTransaction during the first Fabric mount.
 *
 * This is the stock `@react-native-community/cli init` template for 0.86.3 with the sample
 * screen swapped for a plain list. No dependencies were added — `react-native-safe-area-context`
 * is what the template itself ships with.
 *
 * The point is that an ordinary first render is enough. What is needed alongside it is a
 * freshly installed app, which starts slowly because it has no dexopt profile, and something
 * walking the accessibility tree while that first mount is still in flight.
 *
 * See README.md for the exact commands and the measured rates.
 */
import { StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

/** Enough of a first commit to be representative of a real screen. */
const ROWS = Array.from({ length: 40 }, (_, index) => `Row ${index + 1}`);

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

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]} testID="app-root">
      <Text style={styles.title} testID="header">
        Fabric mount repro
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

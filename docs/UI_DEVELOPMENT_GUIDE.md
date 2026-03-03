# UI Development Guide — Mobile App

**For:** Maisam & Annie  
**Last Updated:** 2026-03-03  
**App Location:** `packages/mobile/`

---

## Quick Start

```bash
# From workspace root
cd packages/mobile

# Start development server (hot reload enabled)
pnpm start

# In another terminal, run on Android
pnpm android

# Or test in browser (faster for UI iteration)
cd ../.. && pnpm dev:mobile
```

**Browser vs Native:** The app runs in both browser (for fast iteration) and native Android. Browser mode uses `App.web.jsx` while Android uses `App.jsx`. They share the same screens and components.

---

## Directory Structure — Where Your Code Goes

```
packages/mobile/
├── src/                          ← ALL YOUR UI CODE GOES HERE
│   ├── screens/                  ← ✅ ADD YOUR PAGES HERE
│   │   ├── Channels.jsx          ← Channel list screen
│   │   ├── PTTScreen.jsx         ← Push-to-talk screen
│   │   ├── PTTScreen.tsx         ← TypeScript version (being migrated)
│   │   ├── VoiceChannelChatPage.jsx  ← Voice chat UI
│   │   ├── MapScreen.tsx         ← Map with GPS tracking
│   │   └── LoginScreen.tsx       ← Login/auth (not yet active)
│   │
│   ├── components/               ← ✅ ADD YOUR REUSABLE UI COMPONENTS HERE
│   │   ├── PTTButton.jsx         ← Big red PTT button
│   │   ├── NetworkInfo.jsx       ← Network status indicator
│   │   ├── SignalBar.tsx         ← Signal strength bars
│   │   ├── UserStatus.jsx        ← User online/talking status
│   │   ├── TalkgroupSelector.tsx ← Channel selector UI
│   │   ├── TextPanel.tsx         ← Text chat component
│   │   └── MovingMap.tsx         ← Map with user positions
│   │
│   ├── context/                  ← ✅ ADD GLOBAL STATE HERE
│   │   └── ChannelContext.jsx    ← Current channel state
│   │
│   ├── theme/                    ← ✅ STYLING TOKENS HERE
│   │   └── index.js              ← Colors, spacing, typography
│   │
│   ├── hooks/                    ← Custom React hooks (read-only for now)
│   ├── store/                    ← Global state management (read-only)
│   ├── utils/                    ← ⚠️ DON'T TOUCH — backend integration code
│   ├── shims/                    ← ⚠️ DON'T TOUCH — polyfills for React Native
│   ├── config.js                 ← ⚠️ DON'T TOUCH — environment config
│   ├── App.jsx                   ← ⚠️ DON'T TOUCH — native navigation setup
│   └── App.web.jsx               ← ⚠️ DON'T TOUCH — web navigation setup
│
├── android/                      ← ⚠️ DON'T TOUCH — native Android build config
├── ios/                          ← iOS build config (not used yet)
├── .expo/                        ← ⚠️ DON'T TOUCH — build cache
├── index.js                      ← ⚠️ DON'T TOUCH — app entry point
├── metro.config.js               ← ⚠️ DON'T TOUCH — bundler config
├── package.json                  ← Dependencies (can modify with approval)
└── .env.local                    ← Environment variables (safe to edit)
```

---

## Your Workflow — Adding New UI

### 1. Creating a New Screen

**File:** `packages/mobile/src/screens/YourNewScreen.jsx`

```jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '../theme';

export default function YourNewScreen({ navigation, route }) {
  // navigation.navigate('ScreenName') — navigate to another screen
  // route.params — get params passed from previous screen
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your New Screen</Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  button: {
    backgroundColor: theme.colors.accent.primary,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buttonText: {
    ...theme.typography.button,
    color: theme.colors.text.primary,
  },
});
```

**After creating the file**, ask Saim or check [Adding Routes](#adding-routes-to-navigation) to add it to navigation.

---

### 2. Creating a Reusable Component

**File:** `packages/mobile/src/components/YourComponent.jsx`

```jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '../theme';

/**
 * YourComponent — Brief description of what it does
 * 
 * @param {string} title - The title to display
 * @param {function} onPress - Callback when pressed
 */
export default function YourComponent({ title, onPress }) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background.card,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  text: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
});
```

**Using your component in a screen:**

```jsx
import YourComponent from '../components/YourComponent';

// In your render:
<YourComponent 
  title="Hello World" 
  onPress={() => console.log('Pressed!')}
/>
```

---

### 3. Adding Routes to Navigation

**⚠️ Ask Saim to do this** — Navigation setup is in `App.jsx` and `App.web.jsx`

If you want to add a new screen to navigation, tell Saim:
- Screen name (e.g., "Settings")
- File path (e.g., `src/screens/SettingsScreen.jsx`)
- Header title (e.g., "App Settings")
- Which screens should link to it

He will update both `App.jsx` (native) and `App.web.jsx` (web) to include your screen.

---

## Page Flow — Current Navigation Structure

### Native App (Android/iOS) — Stack Navigation

```
App.jsx (Entry Point)
  └─ NavigationContainer
       └─ Stack.Navigator
            ├─ Channels Screen (Landing page)
            │    └─ List of voice channels
            │         └─ Tap channel → Navigate to PTT Screen
            │
            └─ PTT Screen
                 └─ Big red PTT button to transmit
                 └─ Back button → Navigate to Channels
```

**Navigation Methods:**
```javascript
// In any screen component:
navigation.navigate('PTT', { channelId: 'alpha' });  // Go to PTT screen with params
navigation.goBack();                                  // Go back to previous screen
navigation.replace('Channels');                       // Replace current screen
```

---

### Web App (Browser) — Manual Navigation

```
App.web.jsx (Entry Point)
  └─ State-based routing (useState)
       ├─ activeScreen = 'Channels'  ← Show Channels screen
       ├─ activeScreen = 'PTT'        ← Show PTT screen
       └─ activeScreen = 'Map'        ← Show Map screen (not implemented)
  └─ BottomNav (Tab Bar)
       └─ Switch between screens by setting activeScreen
```

**BottomNav Component:** Located in `App.web.jsx` — handles tab switching at the bottom of the screen.

---

## Styling Guide — Using the Theme System

**Theme File:** `packages/mobile/src/theme/index.js`

### Available Theme Tokens

```javascript
import theme from '../theme';

// Colors
theme.colors.background.primary      // #000000 (black background)
theme.colors.background.secondary    // #231f20 (dark gray)
theme.colors.background.card         // rgba(35, 31, 32, 0.9) (card background)
theme.colors.accent.primary          // #253746 (blue-gray accent)
theme.colors.status.active           // #22C55E (green for active state)
theme.colors.status.danger           // #EF4444 (red for errors/alerts)
theme.colors.text.primary            // #ffffff (white text)
theme.colors.text.secondary          // #cccccc (gray text)

// Spacing
theme.spacing.xs    // 4px
theme.spacing.sm    // 8px
theme.spacing.md    // 16px
theme.spacing.lg    // 24px
theme.spacing.xl    // 32px
theme.spacing.xxl   // 48px

// Border Radius
theme.radius.sm     // 4px
theme.radius.md     // 8px
theme.radius.lg     // 12px
theme.radius.xl     // 16px
theme.radius.full   // 9999px (circles)

// Typography
theme.typography.h1         // fontSize: 32, fontWeight: 'bold'
theme.typography.h2         // fontSize: 24, fontWeight: 'bold'
theme.typography.h3         // fontSize: 20, fontWeight: '600'
theme.typography.body       // fontSize: 16, fontWeight: '400'
theme.typography.caption    // fontSize: 12, color: muted
theme.typography.button     // fontSize: 16, fontWeight: '600'

// Shadows
theme.shadows.sm    // Subtle shadow
theme.shadows.md    // Medium shadow
theme.shadows.lg    // Strong shadow
theme.shadows.glow  // Blue glow effect
```

### Example: Full Styled Component

```jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../theme';

export default function StyledCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background.card,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
  content: {
    paddingTop: theme.spacing.sm,
  },
});
```

**Pro Tip:** Always use theme tokens instead of hardcoded values. This makes it easy to change the entire app's look later.

---

## React Native Basics (If You're Coming from Web)

### Core Components

| React Native | Web Equivalent | Usage |
|-------------|---------------|-------|
| `<View>` | `<div>` | Container element |
| `<Text>` | `<span>` / `<p>` | Text content (REQUIRED for text) |
| `<TouchableOpacity>` | `<button>` | Clickable element with fade effect |
| `<ScrollView>` | `<div style="overflow: scroll">` | Scrollable container |
| `<Image>` | `<img>` | Display images |
| `<TextInput>` | `<input>` | Text input field |
| `<FlatList>` | Map with virtualization | Efficient list rendering |

### Styling Differences

```jsx
// ❌ DON'T DO THIS (web CSS won't work)
<View className="my-class" style={{ display: 'flex' }}>

// ✅ DO THIS (StyleSheet.create)
<View style={styles.container}>

const styles = StyleSheet.create({
  container: {
    // No 'px' units — just numbers
    width: 100,        // NOT width: '100px'
    height: 100,
    
    // Flexbox is default (no display: 'flex' needed)
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    
    // camelCase property names
    backgroundColor: '#000',  // NOT background-color
    marginTop: 10,            // NOT margin-top
  },
});
```

### Text Must Be Wrapped

```jsx
// ❌ WON'T WORK
<View>Hello World</View>

// ✅ CORRECT
<View>
  <Text>Hello World</Text>
</View>
```

### No CSS Classes — Use StyleSheet

```jsx
// ❌ WON'T WORK (no className in React Native)
<View className="card">

// ✅ CORRECT
import { StyleSheet } from 'react-native';

<View style={styles.card}>

const styles = StyleSheet.create({
  card: {
    padding: 16,
    backgroundColor: '#333',
  },
});
```

---

## What NOT to Touch ⚠️

### Do NOT Modify These Files (Backend Integration)

- `src/utils/socket.js` — WebSocket connection logic
- `src/utils/comms.js` — Communication layer initialization
- `src/utils/audio.js` — Audio recording/playback
- `src/hooks/useComms.ts` — Comms integration hook
- `src/store/` — Global state for floor control, GPS, signal
- `src/shims/` — Polyfills for React Native (crypto, ws, etc.)
- `src/config.js` — Environment configuration
- `index.js` — App entry point
- `metro.config.js` — Metro bundler configuration

**Why?** These files handle the backend integration (WebSocket, audio encryption, floor control). Modifying them can break the entire comms system.

**If you need data from comms:** Ask Saim to expose it via React Context or props.

### Do NOT Modify These Files (Build Configuration)

- `android/` — Native Android build files
- `ios/` — Native iOS build files
- `.expo/` — Build cache (auto-generated)
- `metro.config.js` — Metro bundler config
- `babel.config.js` — Babel transpiler config

**Why?** These are carefully configured to make pnpm workspaces + Expo work together. Changes can break the entire build.

### Safe to Edit (With Caution)

- `package.json` — **Ask before adding dependencies**
- `.env.local` — **Safe to edit** for testing different backends
- `App.jsx` / `App.web.jsx` — **Ask Saim** before modifying navigation

---

## Common UI Tasks

### Task 1: Add a Button

```jsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import theme from '../theme';

function MyButton({ title, onPress, disabled = false }) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.accent.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.background.tertiary,
    opacity: 0.5,
  },
  buttonText: {
    ...theme.typography.button,
    color: theme.colors.text.primary,
  },
});

export default MyButton;
```

---

### Task 2: Display a List of Items

```jsx
import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import theme from '../theme';

function MyList() {
  const data = [
    { id: '1', title: 'Item 1' },
    { id: '2', title: 'Item 2' },
    { id: '3', title: 'Item 3' },
  ];

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.itemText}>{item.title}</Text>
    </View>
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: theme.spacing.md,
  },
  item: {
    backgroundColor: theme.colors.background.card,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  itemText: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
});

export default MyList;
```

---

### Task 3: Add an Input Field

```jsx
import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import theme from '../theme';

function MyInput({ label, placeholder }) {
  const [value, setValue] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.muted}
        value={value}
        onChangeText={setValue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    fontSize: 16,
  },
});

export default MyInput;
```

---

### Task 4: Show/Hide a Modal or Overlay

```jsx
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../theme';

function MyModal() {
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <TouchableOpacity onPress={() => setVisible(true)}>
        <Text style={styles.link}>Open Modal</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modal Title</Text>
            <Text style={styles.modalText}>This is a modal</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    color: theme.colors.status.info,
    textDecorationLine: 'underline',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    ...theme.typography.h2,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  modalText: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.lg,
  },
  closeButton: {
    backgroundColor: theme.colors.accent.primary,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  closeButtonText: {
    ...theme.typography.button,
    color: theme.colors.text.primary,
  },
});

export default MyModal;
```

---

### Task 5: Access Global State (Current Channel)

```jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useChannel } from '../context/ChannelContext';
import theme from '../theme';

function MyComponent() {
  const { current, setCurrent } = useChannel();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Current Channel: {current?.name || 'None'}
      </Text>
      
      <TouchableOpacity onPress={() => setCurrent({ id: 'alpha', name: 'Alpha' })}>
        <Text>Switch to Alpha</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
  },
  text: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
});

export default MyComponent;
```

---

## Testing Your UI

### Fast Iteration: Browser Mode

```bash
# From workspace root
pnpm dev:mobile
```

**Pros:**
- Hot reload in ~1 second
- Chrome DevTools for debugging
- No emulator needed

**Cons:**
- Native modules won't work (audio, GPS, etc.)
- Some components may look slightly different

**Use browser mode for:** Layout, styling, button interactions, basic logic

---

### Full Testing: Android Emulator

```bash
# From workspace root
./run-android.sh
```

**Pros:**
- Tests real native behavior
- Audio, GPS, and all native modules work
- Accurate performance testing

**Cons:**
- Slower hot reload (~10 seconds)
- Requires Android emulator running

**Use Android mode for:** Testing PTT button, audio, native features, final QA

---

### Hot Reload (No Rebuild Needed)

When Metro is running:
- **Press `r`** in the Metro terminal to reload the app
- **Shake the device/emulator** and select "Reload"
- Changes to `.jsx` files auto-reload (if hot reload is working)

**If hot reload stops working:**
```bash
# Clear cache and restart
pkill -f "node.*expo"
rm -rf packages/mobile/.expo packages/mobile/node_modules/.cache
./run-android.sh
```

---

## Development Best Practices

### 1. Always Use Theme Tokens

```jsx
// ❌ BAD (hardcoded values)
const styles = StyleSheet.create({
  text: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 8,
  },
});

// ✅ GOOD (theme tokens)
const styles = StyleSheet.create({
  text: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
});
```

---

### 2. Keep Components Small and Focused

```jsx
// ❌ BAD (500-line component doing everything)
function MegaComponent() {
  // 500 lines of mixed concerns
}

// ✅ GOOD (split into smaller components)
function UserCard({ user }) {
  return (
    <View>
      <UserAvatar src={user.avatar} />
      <UserName name={user.name} />
      <UserStatus status={user.status} />
    </View>
  );
}
```

**Rule of thumb:** If a component is > 150 lines, split it into smaller components.

---

### 3. PropTypes or TypeScript for Components

```jsx
// Option 1: PropTypes (JavaScript)
import PropTypes from 'prop-types';

function MyComponent({ title, count, onPress }) {
  // ...
}

MyComponent.propTypes = {
  title: PropTypes.string.isRequired,
  count: PropTypes.number,
  onPress: PropTypes.func.isRequired,
};

// Option 2: TypeScript (preferred for new files)
interface MyComponentProps {
  title: string;
  count?: number;
  onPress: () => void;
}

function MyComponent({ title, count = 0, onPress }: MyComponentProps) {
  // ...
}
```

---

### 4. Use Meaningful Variable Names

```jsx
// ❌ BAD
const x = data.filter(d => d.a > 10);
const y = x.map(d => d.b);

// ✅ GOOD
const activeUsers = data.filter(user => user.loginCount > 10);
const userNames = activeUsers.map(user => user.name);
```

---

### 5. Add Comments for Complex Logic

```jsx
// ✅ GOOD
// Calculate signal strength from 0-5 bars based on RSSI
// RSSI > -60 = 5 bars, RSSI < -100 = 0 bars
function calculateSignalBars(rssi) {
  if (rssi > -60) return 5;
  if (rssi > -70) return 4;
  if (rssi > -80) return 3;
  if (rssi > -90) return 2;
  if (rssi > -100) return 1;
  return 0;
}
```

---

## Getting Help

### Questions About...

| Topic | Ask |
|-------|-----|
| UI design, styling, layouts | Maisam / Annie (you!) |
| Backend integration, WebSocket, audio | Saim |
| Server API, authentication | Shri |
| Navigation, routing, app structure | Saim |
| Adding dependencies, build issues | Saim |

### Common Errors

**Error: "Invariant Violation: Text strings must be rendered within a <Text> component"**
- **Fix:** Wrap all text in `<Text>` tags, not directly in `<View>`

**Error: "Unable to resolve module"**
- **Fix:** Run `pnpm install` and `rm -rf .expo node_modules/.cache`

**Error: Metro bundler stuck / not updating**
- **Fix:** Press `r` in Metro terminal or restart with `./run-android.sh`

**Error: "Cannot read property 'X' of undefined"**
- **Fix:** Add null checks: `user?.name` instead of `user.name`

---

## Useful Resources

- **React Native Docs:** https://reactnative.dev/docs/getting-started
- **Expo Docs:** https://docs.expo.dev/
- **React Navigation:** https://reactnavigation.org/docs/getting-started
- **Theme Reference:** `packages/mobile/src/theme/index.js`
- **Existing Components:** `packages/mobile/src/components/`

---

## Summary: Your Daily Workflow

1. **Start development:** `pnpm dev:mobile` (browser) or `./run-android.sh` (Android)
2. **Create UI components** in `src/components/`
3. **Create screens** in `src/screens/`
4. **Use theme tokens** from `src/theme/`
5. **Test in browser** for fast iteration
6. **Test on Android** for native features
7. **Ask Saim** if you need to modify navigation, backend integration, or build config

**DON'T TOUCH:** `utils/`, `shims/`, `store/`, `config.js`, `metro.config.js`, `android/`, `.expo/`

---

**Need Help?** Ask Saim on Slack or tag him in GitHub issues.

**End of Guide**

// P03 · Component preview (dev only): every primitive in its variants and states.
// Flip Dark/Light at the top to check both themes (brand QA §15).
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { SYMBOLS, type IconName } from "@/core/icons/symbols.generated";
import { useTheme, useThemeControls, type ThemeName } from "@/core/theme";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  Dialog,
  DietMarker,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListItem,
  LogoLockup,
  MacroBar,
  NumberStepper,
  NumberUnit,
  OfflineBanner,
  ProgressBar,
  ProgressRing,
  Screen,
  SegmentedControl,
  Skeleton,
  Slider,
  Text,
  TextField,
  Toggle,
  useToast,
} from "@/core/ui";

export default function ComponentPreview() {
  const { theme, setThemeName } = useThemeControls();
  const { colors } = useTheme();
  const toast = useToast();

  const [chip, setChip] = useState("veg");
  const [choice, setChoice] = useState("normal");
  const [seg, setSeg] = useState<"eat" | "move">("eat");
  const [toggle, setToggle] = useState(true);
  const [stepper, setStepper] = useState(29);
  const [pace, setPace] = useState<"gentle" | "steady" | "ambitious">("steady");
  const [sheet, setSheet] = useState<null | "small" | "medium" | "full">(null);
  const [dialog, setDialog] = useState<null | "confirm" | "destructive">(null);

  return (
    <Screen header={<Header title="Component preview" onBack={() => router.back()} />}>
      <SegmentedControl<ThemeName>
        accessibilityLabel="Theme"
        value={theme.name}
        onChange={setThemeName}
        segments={[
          { value: "dark", label: "Dark", icon: "dark_mode" },
          { value: "light", label: "Light", icon: "light_mode" },
        ]}
      />

      <Section title="Logo · Text">
        <LogoLockup eyebrow="Today's fuel" />
        <Text variant="display-xl" tabular>
          5.02
        </Text>
        <Text variant="headline-lg">Close the Gap</Text>
        <Text variant="headline-md">Meals Timeline</Text>
        <Text variant="headline-sm">Card title</Text>
        <Text variant="title">Paneer bhurji</Text>
        <Text variant="body-lg">{"One meal doesn't define a phase."}</Text>
        <Text variant="body" color="textSecondary">
          Secondary body text
        </Text>
        <Text variant="label-lg">Button label</Text>
        <Text variant="label">Chip label</Text>
        <Text variant="eyebrow" color="secondaryText">
          Coach · Calm Mentor
        </Text>
        <Text variant="caption" color="textSecondary">
          Breakfast · 08:30 AM · Veg
        </Text>
        <NumberUnit value="1,240" unit="kcal" />
        <NumberUnit value="520" unit="kcal" approx variant="headline-md" />
        <View style={styles.row}>
          <Text variant="title" color="primaryText">
            primary-text
          </Text>
          <Text variant="title" color="secondaryText">
            secondary-text
          </Text>
          <Text variant="title" color="tertiaryText">
            tertiary-text
          </Text>
          <Text variant="title" color="streak">
            streak
          </Text>
          <Text variant="title" color="warn">
            warn
          </Text>
          <Text variant="title" color="error">
            error
          </Text>
        </View>
      </Section>

      <Section title="Buttons">
        <Button label="Save" icon="check" size="lg" glow fullWidth />
        <View style={styles.row}>
          <Button label="Primary md" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Ghost" variant="ghost" icon="open_in_new" />
          <Button label="Delete" variant="destructive" />
        </View>
        <View style={styles.row}>
          <Button label="Small" size="sm" />
          <Button label="Loading" loading />
          <Button label="Disabled" disabled />
        </View>
      </Section>

      <Section title="Icon buttons · Avatars">
        <View style={styles.row}>
          <IconButton icon="arrow_back" accessibilityLabel="Back" />
          <IconButton icon="mic" accessibilityLabel="Voice" variant="filled" />
          <IconButton icon="settings" accessibilityLabel="Settings" badge={3} />
          <IconButton icon="close" accessibilityLabel="Close" disabled />
          <Avatar name="Riya" />
          <Avatar name="Drill Sergeant" kind="coach" accent="lime" size={44} />
          <Avatar name="Calm Mentor" kind="coach" accent="lilac" size={44} />
          <Avatar name="Desi Legend" kind="coach" accent="orchid" size={44} />
        </View>
      </Section>

      <Section title="Badges · Diet markers">
        <View style={styles.row}>
          <Badge label="Your usual" tone="lilac" />
          <Badge label="Home" tone="orchid" />
          <Badge label="Blinkit" tone="lime" outline />
          <Badge label="Move" tone="lilac" outline />
          <Badge label="Zomato" />
          <Badge label="estimate" tone="estimate" />
          <Badge label="On track" tone="success" />
          <Badge label="650 over" tone="warning" />
          <Badge label="PR" tone="lime" icon="trophy" />
        </View>
        <View style={styles.row}>
          <DietMarker diet="veg" />
          <DietMarker diet="non_veg" />
          <DietMarker diet="eggetarian" />
          <DietMarker diet="jain" />
        </View>
      </Section>

      <Section title="Chips · Segmented · Toggle · Slider · Stepper">
        <View style={styles.row}>
          {(["veg", "non_veg"] as const).map((d) => (
            <Chip
              key={d}
              label={d === "veg" ? "Veg" : "Non-veg"}
              diet={d}
              selected={chip === d}
              onPress={() => setChip(d)}
            />
          ))}
          <Chip label="Quick < 15 min" icon="timer" />
          <Chip label="Disabled" disabled />
        </View>
        <View style={styles.row}>
          {(["little", "normal", "heavy"] as const).map((c) => (
            <Chip
              key={c}
              kind="choice"
              label={c[0]!.toUpperCase() + c.slice(1)}
              selected={choice === c}
              onPress={() => setChoice(c)}
            />
          ))}
        </View>
        <SegmentedControl
          accessibilityLabel="Eat or move"
          value={seg}
          onChange={setSeg}
          segments={[
            { value: "eat", label: "Eat", icon: "restaurant" },
            { value: "move", label: "Move", icon: "directions_walk" },
          ]}
        />
        <View style={styles.row}>
          <Toggle value={toggle} onValueChange={setToggle} accessibilityLabel="Ask about oil and ghee" />
          <Toggle value={!toggle} onValueChange={(v) => setToggle(!v)} accessibilityLabel="Example off" />
          <Toggle value disabled accessibilityLabel="Disabled toggle" />
        </View>
        <Slider
          label="Pace"
          value={pace}
          onChange={setPace}
          stops={[
            { value: "gentle", label: "Gentle" },
            { value: "steady", label: "Steady" },
            { value: "ambitious", label: "Ambitious" },
          ]}
        />
        <NumberStepper label="Age" value={stepper} onChange={setStepper} min={13} max={100} />
      </Section>

      <Section title="Text fields">
        <TextField label="Meal" placeholder="2 roti, 1 katori dal, paneer bhurji" />
        <TextField label="Weight" unit="kg" keyboardType="decimal-pad" defaultValue="74.6" />
        <TextField label="Height" unit="cm" defaultValue="320" warning="That looks too tall. Check the number." />
        <TextField label="Pincode" defaultValue="40" error="Enter a 6-digit pincode" />
        <TextField label="Disabled" defaultValue="Locked" disabled />
      </Section>

      <Section title="Cards">
        <Card variant="highlighted" eyebrow="Daily goal" glow>
          <Text variant="headline-lg" color="ink">
            Remaining today
          </Text>
          <NumberUnit value="1,240" unit="kcal" color="ink" unitColor="ink" />
        </Card>
        <Card eyebrow="Coach · Calm Mentor">
          <Text variant="body-lg">{"You're 62 g short on protein. An easy dinner can close most of it."}</Text>
        </Card>
        <Card variant="raised" eyebrow="Raised">
          <Text variant="body">Raised / alternate surface.</Text>
        </Card>
        <Card variant="warning" eyebrow="Over target">
          <Text variant="body">{"650 over. Here's how to balance it."}</Text>
        </Card>
        <Card flush eyebrow="List">
          <ListItem icon="restaurant" title="With icon" subtitle="And a subtitle" divider />
          <ListItem title="With value" value="1,950 kcal" divider />
          <ListItem title="With chevron" chevron divider onPress={() => {}} />
          <ListItem
            title="With toggle"
            trailing={<Toggle value={toggle} onValueChange={setToggle} accessibilityLabel="Toggle row" />}
          />
        </Card>
      </Section>

      <Section title="Progress">
        <View style={styles.row}>
          <ProgressRing progress={0.6} color={colors.dataKcal} size="L" accessibilityLabel="Calories 60%">
            <NumberUnit value="1,240" unit="left" variant="headline-md" />
          </ProgressRing>
          <ProgressRing progress={0.52} color={colors.dataProtein} accessibilityLabel="Protein 52%">
            <Text variant="title" tabular>
              68 g
            </Text>
          </ProgressRing>
          <ProgressRing
            progress={1.3}
            color={colors.dataKcal}
            size="S"
            accessibilityLabel="Calories 130%, over target"
          />
        </View>
        <ProgressBar progress={0.53} color={colors.dataActivity} accessibilityLabel="Steps 53%" />
        <ProgressBar progress={1.2} color={colors.dataKcal} accessibilityLabel="Over target" />
        <MacroBar protein={24} carbs={88} fat={14} accessibilityLabel="Protein 24 g, carbs 88 g, fat 14 g" />
      </Section>

      <Section title="States">
        <OfflineBanner mode="offline" />
        <OfflineBanner mode="syncing" pending={3} />
        <Skeleton variant="line" width="60%" />
        <Skeleton variant="card" height={80} />
        <Skeleton variant="ring" size={64} />
        <EmptyState
          icon="restaurant"
          title="No meals yet"
          body="Log your first meal."
          actionLabel="Log a meal"
          onAction={() => {}}
        />
        <ErrorState title="Couldn't save" body="Check your connection." onRetry={() => {}} />
      </Section>

      <Section title="Overlays">
        <View style={styles.row}>
          <Button label="Sheet S" variant="ghost" size="sm" onPress={() => setSheet("small")} />
          <Button label="Sheet M" variant="ghost" size="sm" onPress={() => setSheet("medium")} />
          <Button label="Sheet L" variant="ghost" size="sm" onPress={() => setSheet("full")} />
          <Button label="Dialog" variant="ghost" size="sm" onPress={() => setDialog("confirm")} />
          <Button label="Destructive" variant="ghost" size="sm" onPress={() => setDialog("destructive")} />
        </View>
        <View style={styles.row}>
          <Button
            label="Toast"
            variant="ghost"
            size="sm"
            onPress={() => toast({ message: "Saved", onUndo: () => {} })}
          />
          <Button
            label="Info toast"
            variant="ghost"
            size="sm"
            onPress={() => toast({ message: "Synced 3 items", kind: "info" })}
          />
          <Button
            label="Error toast"
            variant="ghost"
            size="sm"
            onPress={() => toast({ message: "Couldn't save", kind: "error" })}
          />
        </View>
      </Section>

      <Section title={`Icons (${Object.keys(SYMBOLS).length}) · FILL 0 / FILL 1`}>
        <View style={styles.iconGrid}>
          {(Object.keys(SYMBOLS) as IconName[]).map((name) => (
            <View key={name} style={styles.iconCell} accessibilityLabel={name}>
              <Icon name={name} color={colors.textPrimary} />
              <Icon name={name} color={colors.primaryText} filled />
            </View>
          ))}
        </View>
      </Section>

      <BottomSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        size={sheet ?? "small"}
        title="Lunch: check and save"
      >
        <Text variant="body" color="textSecondary">
          Bottom sheet ({sheet}). Tap outside or press back to close.
        </Text>
      </BottomSheet>
      <Dialog
        visible={!!dialog}
        title={dialog === "destructive" ? "Delete this meal?" : "Accept new target?"}
        body={dialog === "destructive" ? "This can't be undone." : "Your target moves to 1,950 kcal."}
        confirmLabel={dialog === "destructive" ? "Delete" : "Accept"}
        destructive={dialog === "destructive"}
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="eyebrow" color="textSecondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconCell: { flexDirection: "row", gap: 4, padding: 6 },
});

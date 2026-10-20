// D87 · The weekly report card: an overall grade, one row per area (average against target, days hit, its grade),
// then what went well, what to work on, and one thing to try next week. Used live on the check-in and for stored weeks.
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Badge, Card, Text, type BadgeTone } from "@/core/ui";
import { formatInt, formatShortDate } from "@/features/targets/format";
import type { Grade, WeekReport } from "@shared/domain/report";

const TONE: Record<Grade, BadgeTone> = { A: "success", B: "lime", C: "warning", D: "orchid" };
const VERDICT: Record<Grade, string> = {
  A: "A great week",
  B: "A good week",
  C: "A mixed week",
  D: "A tough week",
};

function Row({ label, value, sub, grade }: { label: string; value: string; sub: string; grade: Grade | null }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.outline }]}>
      <View style={styles.flex}>
        <Text variant="title">{label}</Text>
        <Text variant="caption" color="textSecondary">
          {sub}
        </Text>
      </View>
      <Text variant="body">{value}</Text>
      <Badge label={grade ?? "–"} tone={grade ? TONE[grade] : "neutral"} />
    </View>
  );
}

export function ReportCard({ report: r, title }: { report: WeekReport; title?: string }) {
  const avg = (v: number | null, unit: string) => (v == null ? "No data" : `${formatInt(v)}${unit}`);
  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="eyebrow" color="textSecondary">
            {title ?? `Report card · ${formatShortDate(r.start)} – ${formatShortDate(r.end)}`}
          </Text>
          <Text variant="headline-md" accessibilityRole="header">
            {VERDICT[r.grade]}
          </Text>
        </View>
        <View accessible accessibilityLabel={`Grade ${r.grade}, score ${r.score} of 100`} style={styles.grade}>
          <Text variant="display">{r.grade}</Text>
          <Text variant="caption" color="textSecondary">{`${r.score}/100`}</Text>
        </View>
      </View>

      <Row
        label="Calories"
        value={avg(r.kcal.avg, " kcal")}
        sub={`Avg target ${formatInt(r.kcal.target)} · on target ${r.kcal.onTargetDays} of ${r.daysLogged} logged days`}
        grade={r.kcal.grade}
      />
      <Row
        label="Protein"
        value={avg(r.protein.avg, " g")}
        sub={`Avg target ${formatInt(r.protein.target)} g · hit ${r.protein.hitDays} of ${r.daysLogged} logged days`}
        grade={r.protein.grade}
      />
      <Row
        label="Steps"
        value={avg(r.steps.avg, "")}
        sub={r.steps.target != null ? `Avg goal ${formatInt(r.steps.target)} · hit ${r.steps.hitDays} of ${r.steps.days} days` : "No step data this week"}
        grade={r.steps.grade}
      />
      <Row
        label="Workouts"
        value={`${r.workouts.done} / ${r.workouts.planned}`}
        sub={r.workouts.planned ? "Done of planned" : "None planned"}
        grade={r.workouts.grade}
      />
      <Text variant="caption" color="textSecondary">
        {`${r.daysLogged} of 7 days fully logged${r.sickDays ? ` · ${r.sickDays} sick day${r.sickDays === 1 ? "" : "s"}` : ""}`}
      </Text>

      {r.wentWell.length ? (
        <View style={styles.section}>
          <Text variant="title">What went well</Text>
          {r.wentWell.map((l) => (
            <Text key={l} variant="body">{`✓ ${l}`}</Text>
          ))}
        </View>
      ) : null}
      {r.toWorkOn.length ? (
        <View style={styles.section}>
          <Text variant="title">What to work on</Text>
          {r.toWorkOn.map((l) => (
            <Text key={l} variant="body">{`• ${l}`}</Text>
          ))}
        </View>
      ) : null}
      {r.focus ? (
        <Text variant="body" color="textSecondary" style={styles.section}>
          {r.focus}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  grade: { alignItems: "center", minWidth: 64 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { gap: 4, marginTop: 8 },
});

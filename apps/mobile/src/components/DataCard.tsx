import type { CardPayload } from "@snow/shared";
import { StyleSheet, Text, View } from "react-native";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function DataCard({ card }: { card: CardPayload }) {
  return <View style={styles.card}>
    <Text style={styles.title}>{card.title}</Text>
    {card.type === "medication_schedule" && card.items.map((item) => <View key={item.medicationId} style={styles.row}>
      <Text style={styles.itemTitle}>{item.name} · {item.dosage}</Text>
      {item.instructions ? <Text style={styles.copy}>{item.instructions}</Text> : null}
      {item.schedule.map((schedule, index) => <Text key={`${item.medicationId}-${index}`} style={styles.copy}>
        {schedule.times.join(", ")} · {schedule.daysOfWeek.map((day) => dayNames[day] ?? "").join(", ")}
      </Text>)}
    </View>)}
    {card.type === "emergency_contacts" && (card.items.length ? card.items.map((item) => <View key={`${item.name}-${item.phone}`} style={styles.row}>
      <Text style={styles.itemTitle}>{item.name} · {item.relationship}</Text><Text style={styles.copy}>{item.phone}</Text>
    </View>) : <Text style={styles.copy}>No emergency contacts are listed.</Text>)}
    {card.type === "unpaid_bills" && (card.items.length ? card.items.map((item) => <View key={item.billId} style={styles.row}>
      <Text style={styles.itemTitle}>{item.payee}</Text><Text style={styles.copy}>{item.description} · ${(item.amountCents / 100).toFixed(2)}</Text>
      <Text style={styles.copy}>Due {new Date(item.dueAt).toLocaleDateString()}</Text>
    </View>) : <Text style={styles.copy}>There are no unpaid bills.</Text>)}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#f5faf9", borderColor: "#cfe3df", borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 14 },
  title: { color: "#163b38", fontSize: 17, fontWeight: "700", marginBottom: 8 },
  row: { borderTopColor: "#dcebe8", borderTopWidth: 1, paddingVertical: 9 },
  itemTitle: { color: "#214a45", fontSize: 15, fontWeight: "600" },
  copy: { color: "#536b67", fontSize: 14, lineHeight: 20, marginTop: 3 },
});

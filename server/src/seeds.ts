import type { BuzzerChartId } from "../../shared/types.ts";
import { BUZZER_CHARTS } from "../../shared/types.ts";

export function chartLabel(id: BuzzerChartId) {
  return BUZZER_CHARTS.find((c) => c.id === id)?.label || "Today's Top Hits";
}

export function isBuzzerChart(value: unknown): value is BuzzerChartId {
  return BUZZER_CHARTS.some((c) => c.id === value);
}

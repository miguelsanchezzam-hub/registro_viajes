// Tipos, etiquetas y utilidades de fecha/dinero compartidas por las pantallas.
import type { api, ApiResponse } from "./api";

export type Trip = ApiResponse<typeof api, "listTrips">["trips"][number];
export type TripType = Trip["type"];
export type Direction = Trip["people"][number]["direction"];

export const TYPE_LABELS: Record<TripType, string> = {
  redondo: "Redondo",
  simple: "Simple",
  doble: "Doble",
  triple: "Triple",
  aeropuerto: "Aeropuerto",
  sucursal: "Sucursal",
  especial: "Especial",
};

export const TYPE_ORDER: TripType[] = [
  "redondo",
  "simple",
  "doble",
  "triple",
  "aeropuerto",
  "sucursal",
  "especial",
];

export const moneyFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function money(cents: number): string {
  return moneyFmt.format(cents / 100);
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function mondayOf(s: string): string {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

export const dayFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
export const shortDayFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
});

export function fmtDay(s: string): string {
  const t = dayFmt.format(parseDate(s));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function fmtRange(from: string, to: string): string {
  return `${shortDayFmt.format(parseDate(from))} – ${shortDayFmt.format(parseDate(to))}`;
}

export function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h = "0", m = "00"] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "p. m." : "a. m.";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}


/* Generated card visuals — bank gradient themes + decorative pattern (no card art assets). */

const BANK_THEMES: [RegExp, [string, string]][] = [
  [/hdfc/i, ["#1e2a5e", "#0f1734"]],
  [/icici/i, ["#7a3410", "#3a1607"]],
  [/axis/i, ["#5a1f3a", "#2a0f22"]],
  [/sbi/i, ["#0f3b4a", "#08222b"]],
  [/amex|american express/i, ["#3a4048", "#181b20"]],
  [/kotak/i, ["#5e1f1f", "#2a0d0d"]],
  [/idfc/i, ["#6e2a4a", "#33112a"]],
];

const DEFAULT_THEME: [string, string] = ["#26303f", "#141922"];

export function cardBg(bank: string): string {
  const theme = BANK_THEMES.find(([re]) => re.test(bank))?.[1] ?? DEFAULT_THEME;
  return `linear-gradient(135deg, ${theme[0]}, ${theme[1]})`;
}

export function cardPattern(seed: number): string {
  const angles = [25, 120, 210, 315];
  const a = angles[Math.abs(seed) % angles.length];
  return `repeating-linear-gradient(${a}deg, rgba(255,255,255,.05) 0 1px, transparent 1px 14px)`;
}

/** Normalize network names to the short display badges from the design. */
export function networkBadge(network: string): string {
  const n = network.toLowerCase();
  if (n.includes("visa")) return "VISA";
  if (n.includes("master")) return "MC";
  if (n.includes("rupay")) return "RUPAY";
  if (n.includes("amex") || n.includes("american")) return "AMEX";
  if (n.includes("diners")) return "DINERS";
  return network.toUpperCase().slice(0, 6);
}

export function isVisa(network: string): boolean {
  return networkBadge(network) === "VISA";
}

/** Stable numeric seed from a UUID for pattern variation. */
export function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

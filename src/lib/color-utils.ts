import type { RGBA } from "@figma/plugin-typings/plugin-api-standalone";

export function rgbaToHex(color: RGB | RGBA): string {
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");

  const r = toHex(color.r);
  const g = toHex(color.g);
  const b = toHex(color.b);
  const alpha = "a" in color ? color.a : 1;

  if (alpha >= 0.999) {
    return `#${r}${g}${b}`.toUpperCase();
  }

  const a = toHex(alpha);
  return `#${r}${g}${b}${a}`.toUpperCase();
}

export function floatToDimension(value: number, unit = "px"): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) {
    return `${rounded}${unit}`;
  }
  return `${rounded}${unit}`;
}

export function slugifyTokenKey(name: string): string {
  return name
    .replace(/\//g, ".")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function toYamlScalar(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (/^[#a-zA-Z][\w#().,%+\-/\s]*$/.test(value) && !value.includes(":")) {
    return value;
  }

  return JSON.stringify(value);
}

export function indentYaml(text: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

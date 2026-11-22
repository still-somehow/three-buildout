/** Small form widgets. Inputs commit on Enter or blur, so typing never spams undo history. */
import { useEffect, useState } from "react";
import type { Vec3 } from "../src/scene/schema";

const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000);

export const NumberField: React.FC<{
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  title?: string;
  width?: number;
}> = ({ value, onCommit, step = 0.1, min, title, width }) => {
  const [text, setText] = useState(fmtNum(value));
  useEffect(() => setText(fmtNum(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || (min !== undefined && n < min)) return setText(fmtNum(value));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="num"
      type="number"
      step={step}
      title={title}
      style={width ? { width } : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
};

export const Vec3Field: React.FC<{ value: Vec3; onCommit: (v: Vec3) => void; step?: number }> = ({ value, onCommit, step }) => (
  <span className="vec3">
    {(["x", "y", "z"] as const).map((axis, i) => (
      <NumberField
        key={axis}
        title={axis}
        step={step}
        value={value[i]}
        onCommit={(n) => onCommit(value.map((v, j) => (j === i ? n : v)) as Vec3)}
      />
    ))}
  </span>
);

export const TextField: React.FC<{ value: string; onCommit: (v: string) => void; placeholder?: string; mono?: boolean }> = ({
  value,
  onCommit,
  placeholder,
  mono,
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={mono ? "text mono" : "text"}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") setText(value);
      }}
    />
  );
};

export const Row: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="row" title={hint}>
    <span className="row-label">{label}</span>
    <span className="row-value">{children}</span>
  </label>
);

export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <div className="section">
    <div className="section-title">
      <span>{title}</span>
      {right}
    </div>
    {children}
  </div>
);

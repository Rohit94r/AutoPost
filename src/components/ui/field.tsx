import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("glass-input h-10 w-full px-3 text-sm text-white placeholder:text-stone outline-none transition", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("glass-input w-full resize-y px-3 py-2.5 text-sm leading-relaxed text-white placeholder:text-stone outline-none transition", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("glass-input h-10 w-full appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat px-3 pr-9 text-sm text-white outline-none", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b9cbc3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-fog", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-stone">{hint}</p>
      ) : null}
    </div>
  );
}

/** Comma/Enter separated tag input. */
export function TagInput({ value, onChange, placeholder, id, max = 30 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; max?: number }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, max));
    setDraft("");
  };
  return (
    <div className="glass-input flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs text-mist">
          {t}
          <button type="button" aria-label={`Remove ${t}`} className="text-fog hover:text-white" onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-stone"
      />
    </div>
  );
}

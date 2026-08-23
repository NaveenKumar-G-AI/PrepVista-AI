import type { FC, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const labelClass = "mb-1 block text-xs font-medium text-ink-soft";
const inputClass =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-harbor";

export const TextField: FC<{ label: string; required?: boolean } & InputHTMLAttributes<HTMLInputElement>> = ({
  label,
  required,
  ...props
}) => (
  <label className="block">
    <span className={labelClass}>
      {label} {required && <span className="text-signal-risk">*</span>}
    </span>
    <input className={inputClass} required={required} {...props} />
  </label>
);

export const TextAreaField: FC<{ label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ label, ...props }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <textarea className={`${inputClass} min-h-20`} {...props} />
  </label>
);

export const SelectField: FC<{ label: string; required?: boolean } & SelectHTMLAttributes<HTMLSelectElement>> = ({
  label,
  required,
  children,
  ...props
}) => (
  <label className="block">
    <span className={labelClass}>
      {label} {required && <span className="text-signal-risk">*</span>}
    </span>
    <select className={inputClass} required={required} {...props}>
      {children}
    </select>
  </label>
);

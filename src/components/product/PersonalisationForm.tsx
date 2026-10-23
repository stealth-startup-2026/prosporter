"use client";

import { useId } from "react";
import {
  visibleFields,
  type PersonalisationAnswers,
  type PersonalisationTree,
} from "@/lib/personalisation";
import { ChevronDown } from "@/components/icons";

const FIELD_CLASS =
  "w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-subtle hover:border-muted focus:border-ink";
const INVALID_CLASS = "border-ink";

/** Stable per-field control id, shared with ProductDetail for focus management. */
export function personalisationFieldId(prefix: string, key: string): string {
  return `${prefix}-${key}`;
}

/**
 * The club / team / number questions on a club jersey (CLNT-171 follow-up).
 *
 * Controlled by ProductDetail: it owns the answers, decides when errors show
 * (after the first "Add to bag" attempt) and reads the attributes to send with
 * the cart line. This component only renders the questions `personalisation.ts`
 * says are visible for the current answers, so a changed parent answer removes
 * its dependants from the page straight away.
 *
 * Accessibility: native <select> and <input> controls with real labels; an
 * invalid control gets aria-invalid and is described by its message; the
 * message slot is reserved so a validation error never shifts the button.
 */
export function PersonalisationForm({
  tree,
  answers,
  errors,
  showErrors,
  idPrefix,
  onChange,
}: {
  tree: PersonalisationTree;
  answers: PersonalisationAnswers;
  errors: Record<string, string>;
  showErrors: boolean;
  idPrefix: string;
  onChange: (key: string, value: string) => void;
}) {
  const uid = useId();
  const headingId = `pers-heading-${uid}`;
  const fields = visibleFields(tree, answers);

  return (
    <fieldset className="mt-8 border-t border-line pt-6" aria-labelledby={headingId}>
      <legend id={headingId} className="eyebrow text-ink">
        Jersey details
      </legend>
      <p className="mt-1 text-xs text-muted">
        Tell us who the jersey is for so the club can match it to the right team and number.
      </p>
      <div className="mt-4 grid gap-4">
        {fields.map((field) => {
          const id = personalisationFieldId(idPrefix, field.key);
          const errorId = `${id}-error`;
          const error = showErrors ? errors[field.key] : undefined;
          const value = answers[field.key] ?? "";
          const describedBy = error ? errorId : field.hint ? `${id}-hint` : undefined;
          const className = `${FIELD_CLASS} ${error ? INVALID_CLASS : ""}`;
          return (
            <div key={field.key}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
                {field.label}
                {field.required && (
                  <span aria-hidden="true" className="text-subtle">
                    {" "}
                    *
                  </span>
                )}
              </label>
              {field.type === "select" ? (
                <div className="relative">
                  <select
                    id={id}
                    value={value}
                    required={field.required}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    className={`${className} appearance-none pr-10`}
                  >
                    <option value="">Select…</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    width={18}
                    height={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
              ) : field.type === "number" ? (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  step={1}
                  value={value}
                  required={field.required}
                  placeholder={field.min != null && field.max != null ? `${field.min}-${field.max}` : undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className={`${className} max-w-[10rem] tabular-nums`}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  autoComplete="family-name"
                  value={value}
                  required={field.required}
                  maxLength={field.maxLength}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className={className}
                />
              )}
              <p
                id={error ? errorId : `${id}-hint`}
                className={`mt-1 min-h-[1.125rem] text-xs ${error ? "text-ink" : "text-subtle"}`}
              >
                {error ?? field.hint ?? ""}
              </p>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

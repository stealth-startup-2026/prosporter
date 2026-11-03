/**
 * Contact form validation (CLNT-171, schedule acceptance criterion 3).
 *
 * Pure and dependency-free on purpose: no Next.js import, no `process.env`, no
 * I/O. That is what lets `src/lib/contact/__tests__/*.test.mjs` import it with
 * plain `node --test` (Node >= 22.18 strips the types), and it keeps the rules
 * identical wherever they run.
 *
 * The field set mirrors the WordPress source form. The migrated Contact page
 * carried Contact Form 7 form 253 ("Contact Form 2"): First Name, Last Name,
 * E-mail address, Subject and a comment textarea (maxlength 2000). Phone is the
 * one addition — the same page advertises a phone line, and a caller-supplied
 * number saves a round trip on order questions. It is optional.
 *
 * The "About the player" block (date of birth, gender, playing level) was asked
 * for by Mladen on 3 Nov 2026 (CLNT-555), matching the Inner West club form
 * (CLNT-554). All three are required.
 *
 * See `docs/forms.md` for the disposition of all three legacy forms.
 */

/** Every field the form posts, in render order. */
export const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "subject",
  "dateOfBirth",
  "gender",
  "playingLevel",
  "message",
] as const;

/** Gender options, the same list as the Inner West form. */
export const PLAYER_GENDERS = ["Female", "Male", "Other", "Prefer not to say"] as const;

/** Playing level options, as Mladen listed them. */
export const PLAYING_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professional"] as const;

/** Oldest date of birth accepted, in years before today. */
export const MAX_PLAYER_AGE_YEARS = 100;

export type ContactField = (typeof CONTACT_FIELDS)[number];

/** One message per field; an absent key means the field is fine. */
export type ContactFieldErrors = Partial<Record<ContactField, string>>;

/** Cleaned values, ready for delivery. */
export type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  /** Empty string when not supplied. */
  phone: string;
  subject: string;
  /** ISO `YYYY-MM-DD`, as the date input posts it. */
  dateOfBirth: string;
  gender: string;
  playingLevel: string;
  message: string;
};

/**
 * Length caps. `message` matches the 2000-character `maxlength` the legacy
 * textarea enforced; the rest are generous enough for real names and short
 * enough that the form cannot be used as a payload channel.
 */
export const LIMITS = {
  firstName: 60,
  lastName: 60,
  email: 160,
  phone: 32,
  subject: 120,
  dateOfBirth: 10,
  gender: 32,
  playingLevel: 32,
  message: 2000,
} as const;

/** Shortest useful message. Anything below this is almost always spam. */
export const MESSAGE_MIN_LENGTH = 10;

/**
 * Deliberately permissive: one `@`, no whitespace, a dot-bearing domain. The
 * server only needs to reject obvious nonsense — an address is proved by the
 * reply, not by a regex, and a stricter pattern rejects valid addresses.
 */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@.,;:<>()[\]\\]+(?:\.[^\s@.,;:<>()[\]\\]+)+$/;

/** Digits plus the usual separators. Australian numbers may start `+61`. */
const PHONE_RE = /^[0-9+()\-. ]{6,}$/;

/**
 * C0 and C1 control characters, minus tab and newline. Nothing a visitor
 * legitimately types contains the rest, and stripping them stops a null byte or
 * an escape sequence reaching the mail body or a log line.
 */
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Normalise one raw form value: non-strings become "", CR/LF collapses to LF,
 * control characters are dropped and the ends are trimmed. This runs before the
 * length checks, so a field padded with control characters cannot slip past.
 */
export function normalizeField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_RE, "").trim();
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Check a `YYYY-MM-DD` date of birth: a real calendar date, not in the future,
 * and no more than `MAX_PLAYER_AGE_YEARS` back. Returns an error message, or
 * null when the date is fine. `today` is injectable for tests.
 */
export function checkDateOfBirth(value: string, today: Date = new Date()): string | null {
  if (!value) return "Date of birth is required.";
  const match = ISO_DATE_RE.exec(value);
  if (!match) return "Enter a valid date of birth.";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "Enter a valid date of birth.";
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return "Date of birth cannot be in the future.";
  if (year < today.getFullYear() - MAX_PLAYER_AGE_YEARS) return "Enter a valid date of birth.";
  return null;
}

/** `2012-05-14` -> `14/05/2012`, the Australian order, for the mail body. */
export function formatDateOfBirth(value: string): string {
  const match = ISO_DATE_RE.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function requireOption(
  errors: ContactFieldErrors,
  field: ContactField,
  value: string,
  options: readonly string[],
  message: string,
): void {
  if (!options.includes(value)) errors[field] = message;
}

/** Collapse a single-line field so a pasted newline cannot forge a mail header. */
function singleLine(value: string): string {
  return value.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function requireText(
  errors: ContactFieldErrors,
  field: ContactField,
  value: string,
  label: string,
  max: number,
): void {
  if (!value) {
    errors[field] = `${label} is required.`;
    return;
  }
  if (value.length > max) {
    errors[field] = `${label} must be ${max} characters or fewer.`;
  }
}

export type ContactValidationResult = {
  ok: boolean;
  values: ContactValues;
  errors: ContactFieldErrors;
};

/**
 * Validate a raw submission. Always returns the normalised values as well as
 * the errors, so the client component can re-render what the visitor typed
 * instead of emptying the form on a failed submit.
 */
export function validateContactSubmission(raw: Record<string, unknown>): ContactValidationResult {
  const values: ContactValues = {
    firstName: singleLine(normalizeField(raw.firstName)),
    lastName: singleLine(normalizeField(raw.lastName)),
    email: singleLine(normalizeField(raw.email)),
    phone: singleLine(normalizeField(raw.phone)),
    subject: singleLine(normalizeField(raw.subject)),
    dateOfBirth: singleLine(normalizeField(raw.dateOfBirth)),
    gender: singleLine(normalizeField(raw.gender)),
    playingLevel: singleLine(normalizeField(raw.playingLevel)),
    message: normalizeField(raw.message),
  };

  const errors: ContactFieldErrors = {};

  requireText(errors, "firstName", values.firstName, "First name", LIMITS.firstName);
  requireText(errors, "lastName", values.lastName, "Last name", LIMITS.lastName);

  if (!values.email) {
    errors.email = "Email address is required.";
  } else if (values.email.length > LIMITS.email) {
    errors.email = `Email address must be ${LIMITS.email} characters or fewer.`;
  } else if (!EMAIL_RE.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (values.phone) {
    const digits = (values.phone.match(/\d/g) ?? []).length;
    if (values.phone.length > LIMITS.phone) {
      errors.phone = `Phone number must be ${LIMITS.phone} characters or fewer.`;
    } else if (!PHONE_RE.test(values.phone) || digits < 6) {
      errors.phone = "Enter a valid phone number, or leave it blank.";
    }
  }

  requireText(errors, "subject", values.subject, "Subject", LIMITS.subject);

  const dateOfBirthError = checkDateOfBirth(values.dateOfBirth);
  if (dateOfBirthError) errors.dateOfBirth = dateOfBirthError;
  requireOption(errors, "gender", values.gender, PLAYER_GENDERS, "Select a gender.");
  requireOption(errors, "playingLevel", values.playingLevel, PLAYING_LEVELS, "Select a playing level.");

  if (!values.message) {
    errors.message = "Message is required.";
  } else if (values.message.length < MESSAGE_MIN_LENGTH) {
    errors.message = `Message must be at least ${MESSAGE_MIN_LENGTH} characters.`;
  } else if (values.message.length > LIMITS.message) {
    errors.message = `Message must be ${LIMITS.message} characters or fewer.`;
  }

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Honeypot: a field hidden from sighted users and removed from the
 * accessibility tree, which a person therefore never fills in. Any value at all
 * means a bot filled the form in wholesale.
 */
export const HONEYPOT_FIELD = "website";

export function isHoneypotFilled(raw: Record<string, unknown>): boolean {
  return normalizeField(raw[HONEYPOT_FIELD]).length > 0;
}

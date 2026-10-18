export type FieldType = "text" | "email" | "tel" | "date" | "number" | "select" | "textarea";

export type Sensitivity = "basic" | "personal" | "sensitive";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  section: string;
  category: Sensitivity;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  /** Word limit for a textarea short answer. Formly writes these from the user's data instead of copying a fact. */
  maxWords?: number;
  /**
   * Optional hints for the fill. identity: a fact about the person (ID number, DOB…) that is only ever copied
   * from their data, never suggested. suggest: a choice or preference (plan, autopay…) that gets a best
   * suggestion with a reason when the data doesn't say. Left out, Formly decides from the label and category.
   */
  identity?: boolean;
  suggest?: boolean;
  /**
   * The business collects it itself and Formly never fills it, whatever the data says: an SSN, a PIN the user
   * creates, a legal consent box. The review lists it under "{business} will ask you for this".
   */
  never?: boolean;
  /** What belongs in the field when the label alone doesn't say, for the fill ("the user's first name"). */
  hint?: string;
  /**
   * For a choice: the usual pick, used whenever nothing in the user's data bears on it, so the suggestion is the
   * same on every run instead of whatever the model picks that time.
   */
  default?: string;
  /** Only asked when another field has this value (the current carrier, only when keeping the number). */
  showIf?: { field: string; value: string };
}

/**
 * A merchant's look for the Formly popup it opens and for its Fill button, the way Stripe Elements or Plaid
 * Link take the merchant's styling. Without one, both keep the Formly look.
 */
export interface MerchantTheme {
  /** Logo in the popup's header; the merchant's full logo, never recolored. */
  logo: string;
  /** The header's step title, e.g. "Fill your signup". */
  headerTitle: string;
  /** The merchant-page button's label, e.g. "Fill it in for me". */
  buttonLabel?: string;
  /** CSS font-family stack, plus the faces to load for it (served by the merchant's own site). */
  font: string;
  fontFaces?: { family: string; weight: string; src: string }[];
  colors: {
    /** Headlines and body text. */
    text: string;
    /** Secondary text and helper lines. */
    muted: string;
    /** The one primary button per view, links, checks and progress. */
    primary: string;
    primaryHover: string;
    primaryText: string;
    /** Card and divider lines. */
    border: string;
    /** Input outlines. */
    input: string;
    /** Quiet fills behind tabs and chips. */
    surface: string;
  };
  /** Corner radii in px. */
  radius: { button: number; input: number; card: number };
}

export interface FormSchema {
  business: string;
  /** Business logo shown in the Formly popup header; falls back to the business name. */
  logo?: string;
  formId: string;
  title: string;
  /** What the business says about itself or the role. Formly uses it to write short answers that fit. */
  context?: string;
  theme?: MerchantTheme;
  fields: FormField[];
}

export interface Source {
  id: string;
  connector: string;
  name: string;
  mime: string | null;
  text: string;
  created_at: number;
}

export interface CriticalFact {
  key: string;
  label: string;
  value: string;
  source: string;
  sensitivity: Sensitivity;
}

export type FactAction = "remove" | "edit" | "censor";

export interface FactOverride {
  label: string;
  action: FactAction;
  value: string | null;
}

export interface Twin {
  markdown: string;
  critical: CriticalFact[];
  /** User edits applied on top of the generated twin, keyed by lowercased fact label. */
  overrides: FactOverride[];
  version: number;
  updatedAt: number;
}

export interface FilledField {
  fieldId: string;
  value: string | null;
  source: string | null;
  confidence: number;
  /** True when the value is Formly's suggestion (a choice or an inference), not a fact copied from the data. */
  suggested?: boolean;
  /** One line on why, drawn from the user's data ("you stream on 2 lines per your Netflix receipts"). */
  reason?: string | null;
}

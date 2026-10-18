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
}

export interface FormSchema {
  business: string;
  /** Business logo shown in the Formly popup header; falls back to the business name. */
  logo?: string;
  formId: string;
  title: string;
  /** What the business says about itself or the role. Formly uses it to write short answers that fit. */
  context?: string;
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
}

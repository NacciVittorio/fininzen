export type Translator = (key: string, fallback?: string) => string;

export type NumericValue = number | string | null | undefined;

export type DatedRecord = {
  date: string;
};

export type IdentifiedRecord = {
  id: number | string;
};

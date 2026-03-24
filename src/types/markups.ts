export type MarkupType = 'pct' | 'flat';

export interface Markup {
  type: MarkupType;
  value: number;
}

export type MarkupsMap = Record<number | string, Markup>;

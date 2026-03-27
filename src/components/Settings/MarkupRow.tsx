/**
 * MarkupRow.tsx
 *
 * Single carrier row in the Rate Browser Account Markups table.
 * Displays carrier name, type toggle ($/%),  value input, and live display.
 * Auto-saves via debounced callbacks (debounce handled by parent).
 */

import React, { useCallback } from 'react';
import type { MarkupEntry } from '../../stores/rateMarkupStore';
import styles from './MarkupRow.module.scss';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MarkupRowProps {
  entry: MarkupEntry;
  onTypeChange: (id: string, type: 'flat' | 'pct') => void;
  onValueChange: (id: string, value: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDisplay(type: 'flat' | 'pct', value: number): string {
  if (type === 'flat') {
    return `+$${value.toFixed(2)}`;
  }
  return `+${value}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MarkupRow({ entry, onTypeChange, onValueChange }: MarkupRowProps): React.ReactElement {
  const { id, name, type, value } = entry;

  // Cycle: flat ($) → pct (%) → flat …
  const handleTypeCycle = useCallback(() => {
    onTypeChange(id, type === 'flat' ? 'pct' : 'flat');
  }, [id, type, onTypeChange]);

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseFloat(e.target.value);
      const clamped = isNaN(raw) ? 0 : Math.min(999, Math.max(0, raw));
      onValueChange(id, clamped);
    },
    [id, onValueChange],
  );

  return (
    <div className={styles.row} role="row">
      <span className={styles.carrierName}>{name}</span>

      <div className={styles.controls}>
        {/* Type spinner: click to cycle $ ↔ % */}
        <div className={styles.typeSpinner} aria-label={`Markup type for ${name}`}>
          <button
            type="button"
            className={styles.spinnerUp}
            onClick={handleTypeCycle}
            aria-label="Next markup type"
          >
            ▲
          </button>
          <span className={styles.spinnerValue} aria-live="polite">
            {type === 'flat' ? '$' : '%'}
          </span>
          <button
            type="button"
            className={styles.spinnerDown}
            onClick={handleTypeCycle}
            aria-label="Previous markup type"
          >
            ▼
          </button>
        </div>

        {/* Value input */}
        <input
          type="number"
          className={styles.valueInput}
          value={value}
          min={0}
          max={999}
          step={type === 'flat' ? 0.01 : 1}
          onChange={handleValueChange}
          aria-label={`Markup value for ${name}`}
        />

        {/* Display */}
        <span className={styles.displayValue} aria-label={`Markup display for ${name}`}>
          {formatDisplay(type, value)}
        </span>
      </div>
    </div>
  );
}

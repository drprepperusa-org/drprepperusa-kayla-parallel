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

  const handleTypeFlat = useCallback(() => {
    onTypeChange(id, 'flat');
  }, [id, onTypeChange]);

  const handleTypePct = useCallback(() => {
    onTypeChange(id, 'pct');
  }, [id, onTypeChange]);

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
        {/* Type toggle: $ / % */}
        <div className={styles.typeToggle} role="group" aria-label={`Markup type for ${name}`}>
          <button
            type="button"
            className={`${styles.typeBtn}${type === 'flat' ? ` ${styles['typeBtn--active']}` : ''}`}
            onClick={handleTypeFlat}
            aria-pressed={type === 'flat'}
            aria-label="Dollar amount"
          >
            $
          </button>
          <button
            type="button"
            className={`${styles.typeBtn}${type === 'pct' ? ` ${styles['typeBtn--active']}` : ''}`}
            onClick={handleTypePct}
            aria-pressed={type === 'pct'}
            aria-label="Percentage"
          >
            %
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

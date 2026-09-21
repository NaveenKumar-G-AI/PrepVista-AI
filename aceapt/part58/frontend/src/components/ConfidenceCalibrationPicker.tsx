import { useState } from 'react';
import type { ConfidenceBand } from '../types';
import './ConfidenceCalibrationPicker.css';

/** §84, §143: "how likely is your selected answer to be correct?" Uses
 *  bands, not a fake-precise percentage (§58 "no false precision"). */
export interface ConfidenceCalibrationPickerProps {
  onSelect?: (band: ConfidenceBand) => void;
}

const BANDS: { band: ConfidenceBand; label: string }[] = [
  { band: 'VERY_LOW', label: 'Very low' },
  { band: 'LOW', label: 'Low' },
  { band: 'MEDIUM', label: 'Medium' },
  { band: 'HIGH', label: 'High' },
  { band: 'VERY_HIGH', label: 'Very high' },
];

export default function ConfidenceCalibrationPicker({ onSelect }: Partial<ConfidenceCalibrationPickerProps>) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  function select(index: number) {
    setSelectedIndex(index);
    onSelect?.(BANDS[index].band);
  }

  return (
    <div className="f58-root f58-conf">
      <p className="f58-conf__question">How likely is this answer to be correct?</p>

      <div className="f58-conf__gauge" role="radiogroup" aria-label="Confidence level">
        <div className="f58-conf__track">
          {selectedIndex !== null && (
            <div className="f58-conf__marker" style={{ left: `${(selectedIndex / (BANDS.length - 1)) * 100}%` }} />
          )}
          <div className="f58-conf__zones">
            {BANDS.map((b, index) => (
              <button
                key={b.band}
                type="button"
                role="radio"
                aria-checked={selectedIndex === index}
                className="f58-conf__zone"
                onClick={() => select(index)}
              >
                <span className="sr-only">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="f58-conf__endpoints">
          <span>Very unlikely</span>
          <span>Very likely</span>
        </div>
      </div>

      <p className="f58-conf__selection" aria-live="polite">
        {selectedIndex !== null ? BANDS[selectedIndex].label : 'Not answered yet'}
      </p>
    </div>
  );
}

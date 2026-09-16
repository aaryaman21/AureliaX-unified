import React from 'react';
import type { RiskLevel } from '../../types';
import { getRiskLabel, getRiskLevel } from '../../types';
import Badge from './Badge';
import type { BadgeVariant } from './Badge';

// ============================================================
// RiskBadge Component — AureliaX UI
// ============================================================

export interface RiskBadgeProps {
  /** The categorical risk level to display */
  riskLevel?: RiskLevel | null;
  /** The numeric risk score (0–100), shown alongside the label */
  score?: number;
  /** Whether to render a coloured dot indicator */
  dot?: boolean;
  /** Whether to animate the dot (useful for live/active sessions) */
  pulse?: boolean;
  /** Show the numeric score inline */
  showScore?: boolean;
  /** Additional CSS class */
  className?: string;
}

/** Maps a RiskLevel to a Badge variant */
function riskLevelToVariant(level: RiskLevel | null): BadgeVariant {
  switch (level) {
    case 'SAFE':      return 'safe';
    case 'SUSPICIOUS': return 'suspicious';
    case 'HIGH_RISK': return 'high-risk';
    default:          return 'neutral';
  }
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  riskLevel,
  score,
  dot = true,
  pulse = false,
  showScore = true,
  className = '',
}) => {
  const effectiveLevel = riskLevel ?? (score !== undefined ? getRiskLevel(score) : null);
  const label = effectiveLevel ? getRiskLabel(effectiveLevel) : 'Unknown';
  const variant = riskLevelToVariant(effectiveLevel);

  const ariaLabel = [
    `Risk level: ${label}`,
    showScore && score !== undefined ? `Score: ${score}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Badge
      variant={variant}
      dot={dot}
      pulse={pulse}
      className={className}
      role="status"
      aria-label={ariaLabel}
    >
      {label}
      {showScore && score !== undefined && (
        <span
          style={{
            marginLeft: '0.375rem',
            fontVariantNumeric: 'tabular-nums',
            opacity: 0.85,
          }}
          aria-hidden="true"
        >
          ({score}%)
        </span>
      )}
    </Badge>
  );
};

export default RiskBadge;

import type {
  AnalyticsMetric,
  Call,
  LanguageDistribution,
  SignalDistribution,
} from '../types';

/**
 * Format a Date object into "MMM DD" (e.g., "Sep 16")
 */
function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

/**
 * Extract date string (YYYY-MM-DD) from a call's startTime
 */
function getCallDateString(startTime: string): string {
  if (!startTime) return '';
  // Handles ISO format "2026-09-16T14:30:00.000Z" or "2026-09-16 14:30:00"
  const datePart = startTime.split(' ')[0].split('T')[0];
  return datePart;
}

/**
 * Computes 7-day call integrity trend dynamically from actual call records.
 * Generates a rolling window of the last 7 calendar days up to the latest call (or today).
 */
export function compute7DayTrend(calls: Call[]): AnalyticsMetric[] {
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Find reference end date (today or the latest call date, whichever is later)
  let endDate = new Date();
  if (calls.length > 0) {
    for (const call of calls) {
      if (call.startTime) {
        const d = new Date(call.startTime);
        if (!isNaN(d.getTime()) && d > endDate) {
          endDate = d;
        }
      }
    }
  }

  // Create 7 day buckets
  const days: { dateObj: Date; dateStr: string; isoDate: string; metric: AnalyticsMetric }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * dayMs);
    const isoDate = d.toISOString().split('T')[0];
    const dateLabel = formatShortDate(d);
    
    days.push({
      dateObj: d,
      dateStr: dateLabel,
      isoDate,
      metric: {
        date: dateLabel,
        callsAnalyzed: 0,
        safeCalls: 0,
        suspiciousCalls: 0,
        highRiskCalls: 0,
        syntheticDetections: 0,
        verificationRequests: 0,
      },
    });
  }

  // Populate counts from real calls
  calls.forEach((call) => {
    const callIso = getCallDateString(call.startTime);
    let matchedBucket = days.find((b) => b.isoDate === callIso);

    // If call has no parseable date or falls within today's time range, attribute to today/latest bucket
    if (!matchedBucket && days.length > 0) {
      const callD = new Date(call.startTime);
      if (!isNaN(callD.getTime())) {
        const short = formatShortDate(callD);
        matchedBucket = days.find((b) => b.dateStr === short);
      }
    }

    // Default to the most recent day if not matched
    if (!matchedBucket && days.length > 0) {
      matchedBucket = days[days.length - 1];
    }

    if (matchedBucket) {
      matchedBucket.metric.callsAnalyzed += 1;
      if (call.riskLevel === 'SAFE') {
        matchedBucket.metric.safeCalls += 1;
      } else if (call.riskLevel === 'SUSPICIOUS') {
        matchedBucket.metric.suspiciousCalls += 1;
        matchedBucket.metric.verificationRequests += 1;
      } else if (call.riskLevel === 'HIGH_RISK') {
        matchedBucket.metric.highRiskCalls += 1;
        matchedBucket.metric.syntheticDetections += 1;
      }
    }
  });

  return days.map((d) => d.metric);
}

/**
 * Computes language distribution dynamically from analyzed call records.
 */
export function computeLanguageDistribution(calls: Call[]): LanguageDistribution[] {
  if (!calls || calls.length === 0) {
    return [];
  }

  const counts: Record<string, number> = {};
  calls.forEach((call) => {
    const lang = call.language || call.analysis?.detectedLanguage || 'Unknown';
    counts[lang] = (counts[lang] || 0) + 1;
  });

  const total = calls.length;
  return Object.entries(counts)
    .map(([language, count]) => ({
      language,
      count,
      percentage: Number(((count / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Computes neural threat signal contributions dynamically from analyzed call records.
 */
export function computeSignalDistribution(calls: Call[]): SignalDistribution[] {
  if (!calls || calls.length === 0) {
    return [
      { signal: 'Neural Vocoder Phase Artifacts', contribution: 0 },
      { signal: 'Speaker Embedding Mismatch', contribution: 0 },
      { signal: 'Prosodic Pitch Flattening', contribution: 0 },
      { signal: 'Unnatural Pause Cadence', contribution: 0 },
      { signal: 'Contextual Fraud Keywords', contribution: 0 },
    ];
  }

  const riskCalls = calls.filter((c) => c.riskLevel === 'HIGH_RISK' || c.riskLevel === 'SUSPICIOUS');

  if (riskCalls.length === 0) {
    return [
      { signal: 'Neural Vocoder Phase Artifacts', contribution: 0 },
      { signal: 'Speaker Embedding Mismatch', contribution: 0 },
      { signal: 'Prosodic Pitch Flattening', contribution: 0 },
      { signal: 'Unnatural Pause Cadence', contribution: 0 },
      { signal: 'Contextual Fraud Keywords', contribution: 0 },
    ];
  }

  let vocoderScore = 0;
  let speakerScore = 0;
  let pitchScore = 0;
  let pauseScore = 0;
  let keywordScore = 0;

  riskCalls.forEach((call) => {
    const an = call.analysis;
    const synthProb = an?.syntheticProbability ?? call.riskScore ?? 50;
    vocoderScore += synthProb;
    speakerScore += Math.max(0, 100 - (an?.speakerSimilarity ?? 50));
    pitchScore += Math.max(0, 100 - (an?.pitchVariation ?? 60));
    pauseScore += an?.pauseAnomaly === 'HIGH' ? 40 : an?.pauseAnomaly === 'MEDIUM' ? 20 : 5;
    keywordScore += (an?.riskFactors?.length || 0) * 10 || 10;
  });

  const total = vocoderScore + speakerScore + pitchScore + pauseScore + keywordScore || 1;

  return [
    { signal: 'Neural Vocoder Phase Artifacts', contribution: Math.round((vocoderScore / total) * 100) },
    { signal: 'Speaker Embedding Mismatch', contribution: Math.round((speakerScore / total) * 100) },
    { signal: 'Prosodic Pitch Flattening', contribution: Math.round((pitchScore / total) * 100) },
    { signal: 'Unnatural Pause Cadence', contribution: Math.round((pauseScore / total) * 100) },
    { signal: 'Contextual Fraud Keywords', contribution: Math.round((keywordScore / total) * 100) },
  ].sort((a, b) => b.contribution - a.contribution);
}

/**
 * Computes authenticity rate and summary stats
 */
export function computeAuthenticityRate(calls: Call[]): {
  rate: string;
  totalCalls: number;
  safeCount: number;
  highRiskCount: number;
  suspiciousCount: number;
} {
  const totalCalls = calls.length;
  const safeCount = calls.filter((c) => c.riskLevel === 'SAFE').length;
  const highRiskCount = calls.filter((c) => c.riskLevel === 'HIGH_RISK').length;
  const suspiciousCount = calls.filter((c) => c.riskLevel === 'SUSPICIOUS').length;

  if (totalCalls === 0) {
    return {
      rate: '100%',
      totalCalls: 0,
      safeCount: 0,
      highRiskCount: 0,
      suspiciousCount: 0,
    };
  }

  const rate = ((safeCount / totalCalls) * 100).toFixed(1) + '%';
  return {
    rate,
    totalCalls,
    safeCount,
    highRiskCount,
    suspiciousCount,
  };
}

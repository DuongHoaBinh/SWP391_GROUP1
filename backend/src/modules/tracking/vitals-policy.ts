export type VitalBand = 'green' | 'amber' | 'red';
export type HealthAlertTier = 'green' | 'amber_observational' | 'amber_escalatable' | 'red';

export interface EquineVitalConfig {
  configId?: number;
  configName: string;
  tempGreenMin: number;
  tempGreenMax: number;
  tempAmberLowMin: number;
  tempAmberHighMax: number;
  hrGreenMin: number;
  hrGreenMax: number;
  hrAmberLowMin: number;
  hrAmberHighMax: number;
  consecutiveAlertWindowHours: number;
  escalatableConditions: string[];
  observationalConditions: string[];
  calibratedBy?: string | null;
  updatedAt?: string;
}

export const DEFAULT_EQUINE_VITAL_CONFIG: EquineVitalConfig = {
  configName: 'Default Equine Transport Vitals v3.1',
  tempGreenMin: 37.5,
  tempGreenMax: 38.5,
  tempAmberLowMin: 37.0,
  tempAmberHighMax: 39.3,
  hrGreenMin: 28,
  hrGreenMax: 44,
  hrAmberLowMin: 24,
  hrAmberHighMax: 60,
  consecutiveAlertWindowHours: 6,
  escalatableConditions: ['not_eating', 'stressed'],
  observationalConditions: ['climate_change', 'other'],
  calibratedBy: 'Pre-Go-Live Baseline (DEC-06)',
};

/**
 * Closed mathematical partition for equine body temperature (°C):
 * - Green: [tempGreenMin, tempGreenMax] -> default [37.5, 38.5]
 * - Red  : < tempAmberLowMin OR >= tempAmberHighMax -> default < 37.0 OR >= 39.3
 * - Amber: [37.0, 37.5) U (38.5, 39.3) (e.g. 38.55°C cleanly falls in Amber)
 */
export function classifyTemperature(tempC: number | null | undefined, cfg: EquineVitalConfig): VitalBand {
  if (tempC === null || tempC === undefined || !Number.isFinite(Number(tempC))) {
    return 'green';
  }
  const t = Number(tempC);
  if (t < cfg.tempAmberLowMin || t >= cfg.tempAmberHighMax) {
    return 'red';
  }
  if (t >= cfg.tempGreenMin && t <= cfg.tempGreenMax) {
    return 'green';
  }
  return 'amber';
}

/**
 * Closed mathematical partition for equine heart rate (bpm):
 * - Green: [hrGreenMin, hrGreenMax] -> default [28, 44]
 * - Red  : < hrAmberLowMin OR >= hrAmberHighMax -> default < 24 OR >= 60
 * - Amber: [24, 28) U (44, 60) (e.g. 25 bpm cleanly falls in Amber)
 */
export function classifyHeartRate(heartRateBpm: number | null | undefined, cfg: EquineVitalConfig): VitalBand {
  if (heartRateBpm === null || heartRateBpm === undefined || !Number.isFinite(Number(heartRateBpm))) {
    return 'green';
  }
  const hr = Number(heartRateBpm);
  if (hr < cfg.hrAmberLowMin || hr >= cfg.hrAmberHighMax) {
    return 'red';
  }
  if (hr >= cfg.hrGreenMin && hr <= cfg.hrGreenMax) {
    return 'green';
  }
  return 'amber';
}

export interface HealthEvaluationInput {
  conditionStatus: string;
  temperatureC?: number | null;
  heartRateBpm?: number | null;
  recordedAt?: Date | string | null;
}

export interface PreviousHorseHealthLog {
  alertTier?: HealthAlertTier | string | null;
  recordedAt: Date | string;
}

export function evaluateEquineHealthAlert(
  current: HealthEvaluationInput,
  prevLogForSameHorse: PreviousHorseHealthLog | null | undefined,
  cfg: EquineVitalConfig = DEFAULT_EQUINE_VITAL_CONFIG,
): { alertTier: HealthAlertTier; alertReason: string | null } {
  const tempBand = classifyTemperature(current.temperatureC, cfg);
  const hrBand = classifyHeartRate(current.heartRateBpm, cfg);
  const cond = String(current.conditionStatus || 'stable').toLowerCase();

  if (tempBand === 'red' || hrBand === 'red') {
    const reasons: string[] = [];
    if (tempBand === 'red') reasons.push(`thân nhiệt ngưỡng ĐỎ (${current.temperatureC}°C)`);
    if (hrBand === 'red') reasons.push(`nhịp tim ngưỡng ĐỎ (${current.heartRateBpm} bpm)`);
    return {
      alertTier: 'red',
      alertReason: `Cảnh báo ĐỎ tức thì: ${reasons.join(', ')}`,
    };
  }

  const escalatableSet = new Set(cfg.escalatableConditions.map((c) => c.toLowerCase()));
  const observationalSet = new Set(cfg.observationalConditions.map((c) => c.toLowerCase()));
  const isEscalatable = tempBand === 'amber' || hrBand === 'amber' || escalatableSet.has(cond);

  if (isEscalatable) {
    const reasons: string[] = [];
    if (tempBand === 'amber') reasons.push(`thân nhiệt Vàng (${current.temperatureC}°C)`);
    if (hrBand === 'amber') reasons.push(`nhịp tim Vàng (${current.heartRateBpm} bpm)`);
    if (escalatableSet.has(cond)) reasons.push(`trạng thái "${cond}"`);

    if (prevLogForSameHorse && prevLogForSameHorse.alertTier === 'amber_escalatable') {
      const curMs = current.recordedAt ? new Date(current.recordedAt).getTime() : Date.now();
      const prevMs = new Date(prevLogForSameHorse.recordedAt).getTime();
      const windowHours = Math.max(1, Number(cfg.consecutiveAlertWindowHours || 6));
      if (Number.isFinite(curMs) && Number.isFinite(prevMs)) {
        const diffHours = (curMs - prevMs) / 3600_000;
        if (diffHours >= 0 && diffHours <= windowHours) {
          return {
            alertTier: 'red',
            alertReason: `Leo thang ĐỎ (>= 2 mốc Vàng leo thang liên tiếp trong ${diffHours.toFixed(1)}h <= ${windowHours}h): ${reasons.join(', ')}`,
          };
        }
      }
    }

    return {
      alertTier: 'amber_escalatable',
      alertReason: `Cảnh báo Vàng (nhóm leo thang): ${reasons.join(', ')}`,
    };
  }

  if (observationalSet.has(cond)) {
    return {
      alertTier: 'amber_observational',
      alertReason: `Theo dõi Vàng (môi trường "${cond}", sinh hiệu Xanh - không tự leo thang Đỏ)`,
    };
  }

  return {
    alertTier: 'green',
    alertReason: null,
  };
}

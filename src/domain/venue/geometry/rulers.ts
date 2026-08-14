export interface RulerTick {
  position: number;
  label: string;
  isMajor: boolean;
}

/**
 * Calculates world coordinate tick marks for canvas rulers based on view bounds and scale.
 */
export function generateRulerTicks(
  minVal: number,
  maxVal: number,
  stepSize: number = 100
): RulerTick[] {
  const ticks: RulerTick[] = [];
  const start = Math.floor(minVal / stepSize) * stepSize;
  const end = Math.ceil(maxVal / stepSize) * stepSize;

  for (let val = start; val <= end; val += stepSize) {
    ticks.push({
      position: val,
      label: val.toString(),
      isMajor: val % (stepSize * 5) === 0,
    });
  }

  return ticks;
}

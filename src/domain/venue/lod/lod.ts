export type LodLevel = 'overview' | 'medium' | 'detailed' | 'micro';

export interface LodVisibility {
  level: LodLevel;
  zoomPercentage: number;
  showAreas: boolean;
  showBlocks: boolean;
  showRows: boolean;
  showSeats: boolean;
  showSeatLabels: boolean;
}

export function calculateLodVisibility(viewBoxWidth: number, defaultWidth: number = 640): LodVisibility {
  if (viewBoxWidth <= 0) viewBoxWidth = defaultWidth;

  const scale = defaultWidth / viewBoxWidth;
  const zoomPercentage = Math.round(scale * 100);

  if (zoomPercentage < 40) {
    return {
      level: 'overview',
      zoomPercentage,
      showAreas: true,
      showBlocks: true,
      showRows: false,
      showSeats: false,
      showSeatLabels: false,
    };
  } else if (zoomPercentage < 80) {
    return {
      level: 'medium',
      zoomPercentage,
      showAreas: true,
      showBlocks: true,
      showRows: true,
      showSeats: false,
      showSeatLabels: false,
    };
  } else if (zoomPercentage < 150) {
    return {
      level: 'detailed',
      zoomPercentage,
      showAreas: true,
      showBlocks: true,
      showRows: true,
      showSeats: true,
      showSeatLabels: false,
    };
  } else {
    return {
      level: 'micro',
      zoomPercentage,
      showAreas: true,
      showBlocks: true,
      showRows: true,
      showSeats: true,
      showSeatLabels: true,
    };
  }
}

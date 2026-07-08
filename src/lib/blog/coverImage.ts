export const BLOG_COVER_ASPECT_RATIO = 16 / 9;
export const BLOG_COVER_WIDTH = 1200;
export const BLOG_COVER_HEIGHT = 675;
export const BLOG_COVER_LABEL = "1200×675 px (16:9)";
export const DEFAULT_COVER_POSITION_Y = 50;

export function coverObjectPosition(positionY: number): string {
  const clamped = Math.min(100, Math.max(0, Math.round(positionY)));
  return `center ${clamped}%`;
}

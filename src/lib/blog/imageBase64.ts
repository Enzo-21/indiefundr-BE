const COVER_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const INLINE_IMAGE_MAX_BYTES = 500 * 1024;

export type ParsedDataUrl = {
  mime: string;
  base64: string;
};

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function assertCoverImageWithinLimit(base64: string) {
  if (estimateBase64Bytes(base64) > COVER_IMAGE_MAX_BYTES) {
    throw new Error("Cover image must be 1 MB or smaller");
  }
}

export function assertInlineImagesWithinLimit(html: string) {
  const dataUrlPattern = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/g;
  let match: RegExpExecArray | null;
  while ((match = dataUrlPattern.exec(html)) !== null) {
    if (estimateBase64Bytes(match[1]) > INLINE_IMAGE_MAX_BYTES) {
      throw new Error("Each inline image must be 500 KB or smaller");
    }
  }
}

export function stripDataUrlPrefix(value: string): string {
  const parsed = parseDataUrl(value);
  return parsed?.base64 ?? value;
}

export function toDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

export function isValidObjectId(id: string): boolean {
  return OBJECT_ID_HEX.test(id);
}

// utils/getRemotePlaneIcon.ts
import { iconMap } from './iconMap';

export const getRemotePlaneIcon = (iconKey: string, isConflict: boolean): any => {
  if (!iconKey) return iconMap['2'];

  const key = isConflict ? `${iconKey}red` : iconKey;
  return iconMap[key] || iconMap['2'];
};

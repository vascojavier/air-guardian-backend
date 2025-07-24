// utils/getOwnPlaneIcon.ts
import { iconMap } from './iconMap';

export const getOwnPlaneIcon = (iconName: string): any => {
  return iconMap[iconName] || iconMap['2']; // '2' como ícono por defecto
};

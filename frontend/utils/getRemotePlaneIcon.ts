import { Plane } from '../types/Plane';
import { iconMap } from './iconMap';

export const getRemotePlaneIcon = (
  iconName: string = '2.png',
  conflictLevel?: Plane['alertLevel']
): any => {
  const baseName = iconName
    .replace('.png', '')
    .replace('red', '')
    .replace('orange', '')
    .replace('yellow', '');

  let suffix = '';
  if (conflictLevel === 'RA_HIGH') {
    suffix = 'red';
  } else if (conflictLevel === 'RA_LOW') {
    suffix = 'orange';
  } else if (conflictLevel === 'TA') {
    suffix = 'yellow';
  }

  const key = suffix ? `${baseName}${suffix}` : `${baseName}`;

  return iconMap[key] || iconMap['2']; // fallback por si no existe
};

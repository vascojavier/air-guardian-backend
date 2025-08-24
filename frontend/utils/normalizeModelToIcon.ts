// utils/normalizeModelToIcon.ts

export const normalizeModelToIcon = (model: string): string => {
  const name = model.toLowerCase();

  if (name.includes('ventus')) return 'ventus.png';
  if (name.includes('piper')) return 'piper.png';
  if (name.includes('cessna') && !name.includes('citation')) return 'cessna.png';
  if (name.includes('citation') || name.includes('jet')) return 'CessnaCitation.png';
  if (name.includes('bi') && name.includes('helice')) return 'BiHelice.png';
  if (name.includes('737')) return 'Boeing737.png';
  if (name.includes('747')) return 'Boeing747.png';
  if (name.includes('asw')) return 'ASW.png';

  return 'default.png';
};

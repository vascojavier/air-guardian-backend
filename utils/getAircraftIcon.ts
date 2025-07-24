export function getAircraftIcon(aircraftName: string, conflict = false): string {

  const suffix = conflict ? "Conflict" : "";

  const aircraftIcons: { [key: string]: string } = {
    ventus: `ventus${suffix}.png`,
    piper: `piper${suffix}.png`,
    cessna: `cessna${suffix}.png`,
    bihelix: `BiHelice${suffix}.png`,
    citation: `CessnaCitation${suffix}.png`,
    boeing737: `Boeing737${suffix}.png`,
    boeing747: `Boeing747${suffix}.png`,
    asw: `ASW${suffix}.png`,
  };

  // Normaliza el nombre a minúsculas
  const name = aircraftName.toLowerCase();

  if (name.includes("ventus")) return aircraftIcons.ventus;
  if (name.includes("piper")) return aircraftIcons.piper;
  if (name.includes("cessna")) return aircraftIcons.cessna;
  if (name.includes("bi") && name.includes("hel")) return aircraftIcons.bihelix;
  if (name.includes("citation") || name.includes("jet")) return aircraftIcons.citation;
  if (name.includes("737")) return aircraftIcons.boeing737;
  if (name.includes("747")) return aircraftIcons.boeing747;
  if (name.includes("asw")) return aircraftIcons.asw;

  return `default${suffix}.png`;  // fallback
}

// Fictional assignments in the documented Nexus v1.8.0 coordinate format.
// Never describes a real venue. API example A1 is centered at (70,1020).
export const nexusMap = {
  size: { x: 840, y: 1293 },
  pits: {
    A1: { position: { x: 70, y: 1020 }, size: { x: 100, y: 100 }, team: '4414' },
    A2: { position: { x: 70, y: 920 }, size: { x: 100, y: 100 }, team: '5669' },
    B1: { position: { x: 270, y: 970 }, size: { x: 100, y: 100 }, team: '1538', angle: 15 },
    B2: { position: { x: 270, y: 870 }, size: { x: 100, y: 100 } },
  },
  areas: { a0: { label: 'Inspection', position: { x: 590, y: 70 }, size: { x: 140, y: 100 } } },
  labels: { l0: { label: 'Field', position: { x: 135, y: 1249 }, size: { x: 100, y: 55 } } },
  arrows: {
    r0: { angle: 180, position: { x: 173, y: 1130 }, size: { x: 46, y: 86 }, type: 'single' },
    r1: { angle: 90, position: { x: 420, y: 1130 }, size: { x: 46, y: 86 }, type: 'double' },
  },
  walls: { w0: { position: { x: 10, y: 570 }, size: { x: 20, y: 1140 } } },
}

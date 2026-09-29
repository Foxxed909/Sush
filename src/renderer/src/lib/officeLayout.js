import { groupByWorkspace } from './workspaces'

// Sush Office floor plans. Pure data: the 3D view renders it, tests pin it.
//
// Campus: one building per project folder on a plaza, a kiosk to open a new
// office, Seducia's statue and the Agents board. Interior: one project's
// office — a desk per live session, a Hire desk, and the door back out.
//
// Units are metres-ish; +x is right, +z is towards the camera.

export const WALL_H = 2.4
export const WALL_T = 0.2
export const DESK_W = 1.6
export const DESK_D = 0.9
export const BUILDING_W = 9
export const BUILDING_D = 7
const BUILDING_GAP_X = 7
const BUILDING_GAP_Z = 8
const INTERIOR_COLS = 4
const INTERIOR_DX = 3.4
const INTERIOR_DZ = 3
const MAX_DESKS = 16

function box(minX, maxX, minZ, maxZ) {
  return { minX, maxX, minZ, maxZ }
}

// ── Campus ──────────────────────────────────────────────────────────────────
export function buildCampusLayout(tabs = []) {
  const groups = groupByWorkspace(tabs)
  const n = groups.length
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n || 1))))
  const rows = Math.max(1, Math.ceil(n / cols))
  const pitchX = BUILDING_W + BUILDING_GAP_X
  const pitchZ = BUILDING_D + BUILDING_GAP_Z
  const width = cols * pitchX - BUILDING_GAP_X
  const depth = rows * pitchZ - BUILDING_GAP_Z

  const buildings = groups.map((group, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = -width / 2 + col * pitchX + BUILDING_W / 2
    const z = -depth - 4 + row * pitchZ + BUILDING_D / 2
    return {
      key: group.key,
      label: group.label,
      cwd: group.cwd || null,
      tabIds: group.tabs.map(t => t.id),
      agents: group.tabs.map(t => ({ tabId: t.id, agentId: t.agentId || 'shell' })),
      x, z, w: BUILDING_W, d: BUILDING_D,
      door: { x, z: z + BUILDING_D / 2 }
    }
  })

  // The plaza sits between the buildings and where you start, so the camera
  // (behind and above you) always looks past you onto the offices.
  const plazaZ = 2
  const floor = {
    minX: Math.min(-18, -width / 2 - 8),
    maxX: Math.max(18, width / 2 + 8),
    minZ: -depth - 12,
    maxZ: plazaZ + 14
  }
  const kiosk = { x: -7, z: plazaZ + 1 }
  const seducia = { x: 0, z: plazaZ }
  const board = { x: 7, z: plazaZ + 1 }

  const colliders = [
    ...buildings.map(b => box(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2)),
    box(kiosk.x - 0.7, kiosk.x + 0.7, kiosk.z - 0.5, kiosk.z + 0.5),
    box(seducia.x - 0.9, seducia.x + 0.9, seducia.z - 0.9, seducia.z + 0.9),
    box(board.x - 1.6, board.x + 1.6, board.z - 0.15, board.z + 0.15),
    ...bounds(floor)
  ]

  const interactables = [
    ...buildings.map(b => ({ kind: 'enter', id: `door:${b.key}`, key: b.key, label: `Enter ${b.label}`, x: b.door.x, z: b.door.z + 0.9 })),
    { kind: 'new-office', id: 'kiosk', label: 'Open a new office', x: kiosk.x, z: kiosk.z + 1 },
    { kind: 'chat', id: 'seducia', label: 'Talk to Seducia', x: seducia.x, z: seducia.z + 1.3 },
    { kind: 'agents', id: 'board', label: 'Open the Agents board', x: board.x, z: board.z + 1 }
  ]

  return { kind: 'campus', buildings, floor, kiosk, seducia, board, spawn: { x: 0, z: plazaZ + 6 }, colliders, interactables }
}

function bounds(floor) {
  return [
    box(floor.minX - 1, floor.minX, floor.minZ, floor.maxZ),
    box(floor.maxX, floor.maxX + 1, floor.minZ, floor.maxZ),
    box(floor.minX, floor.maxX, floor.maxZ, floor.maxZ + 1),
    box(floor.minX, floor.maxX, floor.minZ - 1, floor.minZ)
  ]
}

// ── Interior ────────────────────────────────────────────────────────────────
export function buildInteriorLayout(tabs = [], key) {
  const group = groupByWorkspace(tabs).find(g => g.key === key)
  const sessions = (group?.tabs || []).slice(0, MAX_DESKS - 1)
  const slots = [...sessions.map(tab => ({ tab })), { tab: null }]
  // Small teams sit centred in a smaller room instead of along one wall.
  const cols = Math.min(INTERIOR_COLS, slots.length)
  const rows = Math.ceil(slots.length / cols)
  const w = Math.max(3, cols) * INTERIOR_DX + 2.4
  const d = rows * INTERIOR_DZ + 5.2
  const room = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 }
  const top = room.minZ + 2

  const desks = slots.map((slot, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = (col - (cols - 1) / 2) * INTERIOR_DX
    const z = top + row * INTERIOR_DZ
    return slot.tab
      ? { id: `desk:${slot.tab.id}`, tabId: slot.tab.id, agentId: slot.tab.agentId || 'shell', label: slot.tab.label || 'Session', x, z }
      : { id: 'desk:hire', tabId: null, hire: true, label: 'Hire an agent', x, z }
  })

  const door = { x: 0, z: room.maxZ }
  const doorW = 2.4
  const colliders = [
    box(room.minX - WALL_T, room.minX, room.minZ, room.maxZ),
    box(room.maxX, room.maxX + WALL_T, room.minZ, room.maxZ),
    box(room.minX, room.maxX, room.minZ - WALL_T, room.minZ),
    box(room.minX, door.x - doorW / 2, room.maxZ, room.maxZ + WALL_T),
    box(door.x + doorW / 2, room.maxX, room.maxZ, room.maxZ + WALL_T),
    // The doorway leads out, not into the void: stepping through is "exit".
    box(door.x - doorW / 2, door.x + doorW / 2, room.maxZ + 0.6, room.maxZ + 1),
    ...desks.map(k => box(k.x - DESK_W / 2, k.x + DESK_W / 2, k.z - DESK_D / 2, k.z + DESK_D / 2))
  ]

  const interactables = [
    ...desks.map(k => (k.hire
      ? { kind: 'hire', id: k.id, label: 'Hire an agent here', x: k.x, z: k.z + DESK_D / 2 + 0.55, cwd: group?.cwd || null }
      : { kind: 'session', id: k.id, tabId: k.tabId, label: k.label, x: k.x, z: k.z + DESK_D / 2 + 0.55 })),
    { kind: 'exit', id: 'exit', label: 'Back to campus', x: door.x, z: room.maxZ - 0.4 }
  ]

  return {
    kind: 'interior',
    key,
    label: group?.label || 'Office',
    cwd: group?.cwd || null,
    groupId: group?.tabs?.[0]?.groupId || null,
    room, desks, door, doorW,
    overflow: Math.max(0, (group?.tabs?.length || 0) - (MAX_DESKS - 1)),
    spawn: { x: door.x, z: room.maxZ - 2 },
    colliders,
    interactables
  }
}

// ── Movement + interaction ────────────────────────────────────────────────
function overlaps(x, z, r, b) {
  return x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ
}

// Move a circle of radius r by (dx, dz), sliding along whatever it hits.
export function moveWithCollisions(pos, dx, dz, colliders, r = 0.32) {
  let { x, z } = pos
  if (dx && !colliders.some(b => overlaps(x + dx, z, r, b))) x += dx
  if (dz && !colliders.some(b => overlaps(x, z + dz, r, b))) z += dz
  return { x, z }
}

export function nearestInteractable(pos, layout, reach = 1.7) {
  let best = null
  for (const item of layout?.interactables || []) {
    const distance = Math.hypot(pos.x - item.x, pos.z - item.z)
    if (distance <= reach && (!best || distance < best.distance)) best = { ...item, distance }
  }
  return best
}

// Rebuild keys: change when sessions or projects change, not on state.
export function campusLayoutKey(tabs = []) {
  return tabs.map(t => `${t.id}:${t.agentId || ''}:${t.workspaceCwd || t.sessionRootCwd || t.cwd || ''}`).join('|')
}
export function interiorLayoutKey(tabs = [], key) {
  return `${key}#${tabs.map(t => `${t.id}:${t.agentId || ''}:${t.label || ''}:${t.workspaceCwd || t.sessionRootCwd || t.cwd || ''}`).join('|')}`
}

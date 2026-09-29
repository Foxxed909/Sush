import { groupByWorkspace } from './workspaces'

// Sush Office floor plan. Pure data: the 3D view renders it, tests pin it.
//
// One room per project along the back of the floor, a lobby in front with
// Seducia's reception desk and the Agents board. Each live session gets a desk;
// every room also has one empty desk that launches a new session there.
//
// Units are metres-ish; +x is right, +z is towards the camera.

export const ROOM_W = 10
export const ROOM_D = 8
export const ROOM_GAP = 1.2
export const WALL_H = 2.2
export const WALL_T = 0.2
export const DOOR_W = 2.4
export const LOBBY_D = 9
export const DESK_W = 1.6
export const DESK_D = 0.9
const COLS = 3
const DESK_DX = 3
const DESK_DZ = 2.6
const MAX_DESKS = 9

function roomDesks(tabs, roomX, cwd) {
  const shown = tabs.slice(0, MAX_DESKS - 1)
  const slots = [...shown.map(tab => ({ tab })), { tab: null }]
  const rows = Math.ceil(slots.length / COLS)
  const top = -ROOM_D + 1.9
  return slots.map((slot, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const x = roomX + (col - (COLS - 1) / 2) * DESK_DX
    const z = top + row * DESK_DZ * (rows > 2 ? 0.9 : 1)
    return slot.tab
      ? { id: `desk:${slot.tab.id}`, tabId: slot.tab.id, agentId: slot.tab.agentId || 'shell', label: slot.tab.label || 'Session', x, z }
      : { id: `desk:new:${cwd || roomX}`, tabId: null, cwd: cwd || null, label: 'New session', x, z }
  })
}

export function buildOfficeLayout(tabs = []) {
  const groups = groupByWorkspace(tabs)
  const count = Math.max(1, groups.length)
  const span = count * ROOM_W + (count - 1) * ROOM_GAP
  const left = -span / 2

  const rooms = (groups.length ? groups : [{ key: 'empty', label: 'Your first project', cwd: null, tabs: [] }])
    .map((group, index) => {
      const x = left + index * (ROOM_W + ROOM_GAP) + ROOM_W / 2
      return {
        key: group.key,
        label: group.label,
        cwd: group.cwd || null,
        x,
        z: -ROOM_D / 2,
        w: ROOM_W,
        d: ROOM_D,
        desks: roomDesks(group.tabs || [], x, group.cwd),
        overflow: Math.max(0, (group.tabs || []).length - (MAX_DESKS - 1))
      }
    })

  const floor = { minX: left - 1.5, maxX: left + span + 1.5, minZ: -ROOM_D - 0.5, maxZ: LOBBY_D }
  const lobby = {
    seducia: { id: 'seducia', x: Math.min(-3, floor.maxX - 4), z: LOBBY_D - 3.4, label: 'Seducia' },
    board: { id: 'board', x: Math.max(3, floor.minX + 4), z: LOBBY_D - 0.6, label: 'Agents board' }
  }

  return {
    rooms,
    floor,
    lobby,
    spawn: { x: 0, z: LOBBY_D / 2 },
    colliders: officeColliders(rooms, floor, lobby)
  }
}

// Axis-aligned boxes the player can't walk through: room walls (with a door
// in each front wall), desks, the reception desk and the outer bounds.
export function officeColliders(rooms, floor, lobby) {
  const boxes = []
  const wall = (minX, maxX, minZ, maxZ) => boxes.push({ minX, maxX, minZ, maxZ })
  for (const room of rooms) {
    const x0 = room.x - room.w / 2
    const x1 = room.x + room.w / 2
    const z0 = -room.d
    wall(x0, x1, z0 - WALL_T, z0)                  // back
    wall(x0 - WALL_T, x0, z0, 0)                   // left
    wall(x1, x1 + WALL_T, z0, 0)                   // right
    const doorL = room.x - DOOR_W / 2
    const doorR = room.x + DOOR_W / 2
    wall(x0, doorL, -WALL_T / 2, WALL_T / 2)       // front, left of the door
    wall(doorR, x1, -WALL_T / 2, WALL_T / 2)       // front, right of the door
    for (const desk of room.desks) {
      wall(desk.x - DESK_W / 2, desk.x + DESK_W / 2, desk.z - DESK_D / 2, desk.z + DESK_D / 2)
    }
  }
  const s = lobby.seducia
  wall(s.x - 1.3, s.x + 1.3, s.z - 0.5, s.z + 0.5)
  const b = lobby.board
  wall(b.x - 1.5, b.x + 1.5, b.z - 0.1, b.z + 0.1)
  wall(floor.minX - 1, floor.minX, floor.minZ, floor.maxZ)
  wall(floor.maxX, floor.maxX + 1, floor.minZ, floor.maxZ)
  wall(floor.minX, floor.maxX, floor.maxZ, floor.maxZ + 1)
  wall(floor.minX, floor.maxX, floor.minZ - 1, floor.minZ)
  return boxes
}

function overlaps(x, z, r, box) {
  return x + r > box.minX && x - r < box.maxX && z + r > box.minZ && z - r < box.maxZ
}

// Move a circle of radius r by (dx, dz), sliding along whatever it hits.
export function moveWithCollisions(pos, dx, dz, colliders, r = 0.32) {
  let { x, z } = pos
  if (dx && !colliders.some(box => overlaps(x + dx, z, r, box))) x += dx
  if (dz && !colliders.some(box => overlaps(x, z + dz, r, box))) z += dz
  return { x, z }
}

// The thing the player would interact with from here, if any.
export function nearestInteractable(pos, layout, reach = 1.7) {
  let best = null
  const consider = (target, x, z) => {
    const d = Math.hypot(pos.x - x, pos.z - z)
    if (d <= reach && (!best || d < best.distance)) best = { ...target, distance: d }
  }
  for (const room of layout.rooms) {
    for (const desk of room.desks) {
      consider(
        desk.tabId
          ? { kind: 'session', id: desk.id, tabId: desk.tabId, label: desk.label }
          : { kind: 'new', id: desk.id, cwd: desk.cwd, label: `New session in ${room.label}` },
        desk.x,
        desk.z + DESK_D / 2 + 0.55
      )
    }
  }
  consider({ kind: 'chat', id: 'seducia', label: 'Talk to Seducia' }, layout.lobby.seducia.x, layout.lobby.seducia.z + 1)
  consider({ kind: 'agents', id: 'board', label: 'Open the Agents board' }, layout.lobby.board.x, layout.lobby.board.z - 1)
  return best
}

export function officeLayoutKey(tabs = []) {
  return tabs.map(tab => `${tab.id}:${tab.agentId || ''}:${tab.label || ''}:${tab.workspaceCwd || tab.sessionRootCwd || tab.cwd || ''}`).join('|')
}

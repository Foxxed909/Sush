import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, PlaneGeometry, RepeatWrapping, RingGeometry, Vector3
} from 'three'
import { DESK_D, DESK_W, WALL_H, WALL_T } from '../../lib/officeLayout'

// Scene builders for Sush Office. Everything here is geometry + materials;
// state, input and the render loop live in SushOffice.jsx. Text is never drawn
// into the 1/3-resolution scene (it would pixelate into noise): each builder
// returns world-space anchors, and the React overlay positions crisp DOM
// labels on them.

export const mat = (color, extra = {}) => new MeshLambertMaterial({ color, flatShading: true, ...extra })

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  return mesh
}

function nearest(texture) {
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  return texture
}

export function checkerTexture(a, b, repeatX, repeatY) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 16
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = a; ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = b; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8)
  const texture = nearest(new CanvasTexture(canvas))
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

// A voxel person: legs and arms pivot at hip/shoulder so walking, typing and
// sitting are plain rotations.
export function voxelPerson(color) {
  const group = new Group()
  const body = mat(color)
  const dark = mat('#23252b')
  const skin = mat('#f1c7a8')
  const legL = box(0.16, 0.45, 0.18, dark, -0.1, 0.225, 0)
  const legR = box(0.16, 0.45, 0.18, dark, 0.1, 0.225, 0)
  const torso = box(0.46, 0.5, 0.28, body, 0, 0.7, 0)
  const armL = box(0.12, 0.44, 0.14, body, -0.3, 0.72, 0)
  const armR = box(0.12, 0.44, 0.14, body, 0.3, 0.72, 0)
  const head = box(0.36, 0.34, 0.34, skin, 0, 1.13, 0)
  const eyes = mat('#08090a')
  head.add(box(0.05, 0.06, 0.02, eyes, -0.08, 0.02, 0.175))
  head.add(box(0.05, 0.06, 0.02, eyes, 0.08, 0.02, 0.175))
  for (const leg of [legL, legR]) { leg.geometry.translate(0, -0.225, 0); leg.position.y += 0.225 }
  for (const arm of [armL, armR]) { arm.geometry.translate(0, -0.18, 0); arm.position.y += 0.18 }
  group.add(legL, legR, torso, armL, armR, head)
  group.userData.parts = { legL, legR, armL, armR, head, torso }
  return group
}

export function sit(person) {
  const p = person.userData.parts
  p.legL.rotation.x = p.legR.rotation.x = -Math.PI / 2.2
}
export function stand(person) {
  const p = person.userData.parts
  p.legL.rotation.x = p.legR.rotation.x = 0
}

// ── Monitor screens (live terminal mirror) ────────────────────────────────
export function screenTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const texture = nearest(new CanvasTexture(canvas))
  return { canvas, texture }
}

export function paintScreen(screen, { lines = [], color = '#8b9bb0', bg = '#07060c', title = '', sleeping = false }) {
  const ctx = screen.canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 256, 160)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 256, 14)
  ctx.fillStyle = '#0b0a10'
  ctx.font = '700 10px ui-monospace, monospace'
  ctx.fillText(title.slice(0, 36), 6, 10)
  ctx.font = '10px ui-monospace, monospace'
  if (sleeping) {
    ctx.fillStyle = '#6b6680'
    ctx.fillText('sleeping — open to wake', 8, 86)
  } else {
    ctx.fillStyle = '#d8d4ea'
    lines.slice(-12).forEach((line, i) => ctx.fillText(String(line).slice(0, 42), 6, 28 + i * 11))
  }
  screen.texture.needsUpdate = true
}

export function buildDesk({ desk, theme, accent }) {
  const group = new Group()
  group.position.set(desk.x, 0, desk.z)
  const wood = mat(theme.desk)
  group.add(box(DESK_W, 0.08, DESK_D, wood, 0, 0.74, 0))
  for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) group.add(box(0.07, 0.72, 0.07, wood, lx, 0.36, lz))
  const monitor = box(0.86, 0.56, 0.06, mat('#0f0e14'), 0, 1.1, -0.22)
  group.add(monitor, box(0.08, 0.2, 0.08, mat('#0f0e14'), 0, 0.86, -0.22))
  const anchors = {}
  let screen = null
  if (desk.tabId) {
    screen = screenTexture()
    const face = new Mesh(new PlaneGeometry(0.78, 0.48), new MeshBasicMaterial({ map: screen.texture }))
    face.position.set(0, 0, 0.032)
    monitor.add(face)
    const chair = box(0.5, 0.08, 0.5, mat('#1f1c28'), 0, 0.46, 0.75)
    chair.add(box(0.5, 0.55, 0.08, mat('#1f1c28'), 0, 0.3, 0.22))
    group.add(chair)
    anchors.label = new Vector3(desk.x, 2.1, desk.z + 0.6)
  } else {
    const holo = new Mesh(new PlaneGeometry(0.78, 0.48), new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35 }))
    holo.position.set(0, 0, 0.032)
    monitor.add(holo)
    anchors.label = new Vector3(desk.x, 1.75, desk.z)
  }
  // Where the camera parks to "enter" this monitor, and what it looks at.
  anchors.monitor = new Vector3(desk.x, 1.1, desk.z - 0.22)
  group.userData = { desk, screen, monitor, anchors, lastPaint: '' }
  return group
}

// ── Backdrops (interior back-wall window) ─────────────────────────────────
export function backdropTexture(theme) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, theme.sky[0])
  g.addColorStop(1, theme.sky[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 64)
  let seed = 7
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  if (theme.backdrop === 'stars' || theme.backdrop === 'planet') {
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 70; i++) ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 44), 1, 1)
  }
  if (theme.backdrop === 'planet') {
    ctx.fillStyle = '#4b6bd6'; ctx.beginPath(); ctx.arc(200, 44, 22, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#7ab8ff'; ctx.fillRect(176, 40, 48, 3)
  }
  if (theme.backdrop === 'skyline') {
    for (let x = 0; x < 256;) {
      const w = 8 + Math.floor(rand() * 18)
      const h = 14 + Math.floor(rand() * 36)
      ctx.fillStyle = '#120c22'; ctx.fillRect(x, 64 - h, w - 2, h)
      ctx.fillStyle = rand() > 0.5 ? '#5ef3ff' : '#ff6bd6'
      for (let y = 64 - h + 3; y < 60; y += 5) if (rand() > 0.55) ctx.fillRect(x + 2, y, 2, 2)
      x += w
    }
  }
  if (theme.backdrop === 'pines') {
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(40, 10, 5, 5)
    for (let x = -6; x < 260; x += 12) {
      const h = 18 + Math.floor(rand() * 26)
      ctx.fillStyle = rand() > 0.5 ? '#16301f' : '#1d3a26'
      ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x + 8, 64 - h); ctx.lineTo(x + 16, 64); ctx.fill()
    }
  }
  if (theme.backdrop === 'sun') {
    ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(128, 58, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#3b1d33'; ctx.fillRect(0, 56, 256, 8)
    for (let x = 0; x < 256; x += 10 + Math.floor(rand() * 10)) ctx.fillRect(x, 44 + Math.floor(rand() * 10), 7, 20)
  }
  return nearest(new CanvasTexture(canvas))
}

// ── Campus pieces ─────────────────────────────────────────────────────────
export function buildBuilding(building, theme, accent) {
  const group = new Group()
  group.position.set(building.x, 0, building.z)
  const h = 4.2
  const trim = theme.trim === 'accent' ? accent : theme.trim
  group.add(box(building.w, h, building.d, mat(theme.wall), 0, h / 2, 0))
  group.add(box(building.w + 0.4, 0.3, building.d + 0.4, mat(trim), 0, h + 0.15, 0))
  group.add(box(1.6, 2.2, 0.1, mat('#08070c'), 0, 1.1, building.d / 2 + 0.02))
  group.add(box(1.9, 0.12, 0.14, mat(trim), 0, 2.26, building.d / 2 + 0.04))
  // One window per agent (up to 12) — lit by that agent's live state.
  const windows = []
  const count = Math.min(12, Math.max(1, building.agents.length))
  const cols = Math.min(6, count)
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const win = new Mesh(new PlaneGeometry(0.7, 0.55), new MeshBasicMaterial({ color: '#2a2438' }))
    win.position.set((col - (cols - 1) / 2) * 1.2, 3.35 - row * 0.8, building.d / 2 + 0.02)
    group.add(win)
    windows.push({ mesh: win, tabId: building.agents[i]?.tabId || null })
  }
  // A lamp either side of the door.
  for (const side of [-1, 1]) {
    group.add(box(0.12, 1.4, 0.12, mat('#2a2438'), side * 1.4, 0.7, building.d / 2 + 0.9))
    group.add(box(0.24, 0.24, 0.24, new MeshBasicMaterial({ color: theme.light }), side * 1.4, 1.5, building.d / 2 + 0.9))
  }
  group.userData = {
    building,
    windows,
    anchors: {
      sign: new Vector3(building.x, h + 1.15, building.z + building.d / 2),
      door: new Vector3(building.x, 2.6, building.z + building.d / 2 + 0.2)
    }
  }
  return group
}

// The "opening" flourish for a new office: a ring that spreads and fades.
export function openingRing(x, z, color) {
  const ring = new Mesh(new RingGeometry(0.8, 1.1, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(x, 0.03, z)
  return ring
}

// The meeting table: a low slab with a glowing inlay that lights up while a
// meeting (a broadcast to this office) is in session.
export function buildMeetingTable(meeting, theme, accent) {
  const group = new Group()
  group.position.set(meeting.x, 0, meeting.z)
  const wood = mat(theme.desk)
  const s = meeting.size
  group.add(box(s, 0.1, s, wood, 0, 0.72, 0))
  group.add(box(0.5, 0.68, 0.5, wood, 0, 0.34, 0))
  const inlay = new Mesh(new PlaneGeometry(s * 0.6, s * 0.6), new MeshBasicMaterial({ color: '#2a2438' }))
  inlay.rotation.x = -Math.PI / 2
  inlay.position.y = 0.775
  group.add(inlay)
  group.userData.inlay = inlay
  group.userData.accent = accent
  group.userData.anchors = { label: new Vector3(meeting.x, 1.7, meeting.z) }
  return group
}

export function buildKiosk(kiosk, accent) {
  const group = new Group()
  group.position.set(kiosk.x, 0, kiosk.z)
  group.add(box(1.2, 1.1, 0.7, mat('#221d30'), 0, 0.55, 0))
  const screen = box(1.0, 0.6, 0.06, new MeshBasicMaterial({ color: accent }), 0, 1.4, 0.1)
  screen.rotation.x = -0.35
  group.add(screen)
  group.userData.anchors = { label: new Vector3(kiosk.x, 2.2, kiosk.z) }
  return group
}

export function buildStatue(spot, accent) {
  const group = new Group()
  group.add(new Mesh(new CylinderGeometry(0.9, 1, 0.5, 8), mat('#2a2438')))
  group.children[0].position.y = 0.25
  const seducia = voxelPerson('#ff6b9d')
  seducia.position.y = 0.5
  group.add(seducia)
  const orb = new Mesh(new IcosahedronGeometry(0.18, 0), new MeshBasicMaterial({ color: accent }))
  orb.position.set(0.55, 1.8, 0)
  group.add(orb)
  group.position.set(spot.x, 0, spot.z)
  group.userData = { orb, anchors: { label: new Vector3(spot.x, 2.6, spot.z) } }
  return group
}

export function buildBoard(spot) {
  const group = new Group()
  group.position.set(spot.x, 0, spot.z)
  group.add(box(3, 1.6, 0.12, mat('#0f0e14'), 0, 1.4, 0))
  group.add(box(0.1, 0.7, 0.1, mat('#2a2438'), -1.2, 0.35, 0), box(0.1, 0.7, 0.1, mat('#2a2438'), 1.2, 0.35, 0))
  group.userData.anchors = { label: new Vector3(spot.x, 1.4, spot.z + 0.12) }
  return group
}

export function buildTree(x, z) {
  const group = new Group()
  group.add(box(0.3, 1, 0.3, mat('#4a3526'), 0, 0.5, 0))
  group.add(box(1.3, 1.1, 1.3, mat('#2f6b4a'), 0, 1.45, 0))
  group.add(box(0.8, 0.7, 0.8, mat('#3f8f6b'), 0, 2.3, 0))
  group.position.set(x, 0, z)
  return group
}

export function disposeTree(root) {
  root.traverse(obj => {
    obj.geometry?.dispose?.()
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of materials) { m.map?.dispose?.(); m.dispose?.() }
  })
}

export { WALL_H, WALL_T }

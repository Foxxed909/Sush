import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, LinearFilter, NearestFilter, PlaneGeometry, Points, PointsMaterial, RepeatWrapping, RingGeometry, Vector3
} from 'three'
import { DESK_D, DESK_W, WALL_H, WALL_T, interiorDecor } from '../../lib/officeLayout'

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

const lift = (hex, amt) => '#' + new Color(hex).lerp(new Color('#ffffff'), amt).getHexString()
export { lift }

function canvasOf(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function tiled(canvas, rx, ry) {
  const texture = nearest(new CanvasTexture(canvas))
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(rx, ry)
  return texture
}

// Wood planks with a staggered seam, one pixel-art tile per ~2m.
export function plankTexture(a, b, rx, ry) {
  const c = canvasOf(32, 32)
  const ctx = c.getContext('2d')
  const rows = 4
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r % 2 ? a : b
    ctx.fillRect(0, r * 8, 32, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(0, r * 8, 32, 1)
    ctx.fillRect((r * 11) % 32, r * 8, 1, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(((r * 7) % 24) + 3, r * 8 + 3, 5, 1)
  }
  return tiled(c, rx, ry)
}

// Square tiles with a faint grout line and a bevel.
export function tileTexture(a, b, rx, ry) {
  const c = canvasOf(32, 32)
  const ctx = c.getContext('2d')
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = (x + y) % 2 ? a : b
    ctx.fillRect(x * 16, y * 16, 16, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 1)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(x * 16, y * 16, 16, 1)
    ctx.fillRect(x * 16, y * 16, 1, 16)
  }
  return tiled(c, rx, ry)
}

export function wallTexture(base, rx) {
  const c = canvasOf(16, 32)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base; ctx.fillRect(0, 0, 16, 32)
  ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(0, 0, 1, 32)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(8, 0, 1, 32)
  return tiled(c, rx, 1)
}

// A woven rug: accent border, inner stripe, diamond field.
export function rugTexture(base, accent) {
  const c = canvasOf(64, 64)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = accent; ctx.globalAlpha = 0.32
  ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 61, 64, 3); ctx.fillRect(0, 0, 3, 64); ctx.fillRect(61, 0, 3, 64)
  ctx.globalAlpha = 0.14
  ctx.fillRect(6, 6, 52, 1); ctx.fillRect(6, 57, 52, 1); ctx.fillRect(6, 6, 1, 52); ctx.fillRect(57, 6, 1, 52)
  ctx.globalAlpha = 0.07
  for (let y = 10; y < 54; y += 8) for (let x = 10; x < 54; x += 8) {
    ctx.fillRect(x + 3, y, 2, 2); ctx.fillRect(x + 1, y + 2, 6, 2); ctx.fillRect(x + 3, y + 4, 2, 2)
  }
  ctx.globalAlpha = 1
  return nearest(new CanvasTexture(c))
}

let glowMap = null
function glowTexture() {
  if (glowMap) return glowMap
  const c = canvasOf(64, 64)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  glowMap = new CanvasTexture(c)
  glowMap.userData = { shared: true }
  return glowMap
}

// A faked light pool: additive soft disc lying on the floor (or standing on a
// wall when `wall` is set). No real lights, no shadows.
export function glow(color, size, opacity = 0.5, { wall = false, y = 0.02 } = {}) {
  const m = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false })
  )
  if (!wall) m.rotation.x = -Math.PI / 2
  m.position.y = y
  m.renderOrder = 2
  return m
}

const SKINS = ['#f1c7a8', '#e0a97d', '#c68863', '#9a6240', '#6f4529', '#f5d5bd']
const HAIRS = ['#1b1410', '#4a2c1a', '#8a5a2b', '#d9a441', '#c04a2f', '#2b2e4a', '#e8e2d8', '#ff6b9d']
export const hashSeed = str => { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }

// A voxel person: legs and arms pivot at hip/shoulder so walking, typing and
// sitting are plain rotations. `seed` picks skin, hair colour and style.
export function voxelPerson(color, seed = 0) {
  const group = new Group()
  const body = mat(color)
  const dark = mat('#23252b')
  const skinHex = SKINS[seed % SKINS.length]
  const skin = mat(skinHex)
  const hairMat = mat(HAIRS[Math.floor(seed / 7) % HAIRS.length])
  const style = Math.floor(seed / 53) % 4
  const legL = box(0.16, 0.45, 0.18, dark, -0.1, 0.225, 0)
  const legR = box(0.16, 0.45, 0.18, dark, 0.1, 0.225, 0)
  const torso = box(0.46, 0.5, 0.28, body, 0, 0.7, 0)
  torso.add(box(0.2, 0.06, 0.02, mat(lift(color, 0.45)), 0, 0.2, 0.145))
  const armL = box(0.12, 0.44, 0.14, body, -0.3, 0.72, 0)
  const armR = box(0.12, 0.44, 0.14, body, 0.3, 0.72, 0)
  const head = box(0.36, 0.34, 0.34, skin, 0, 1.13, 0)
  const eyes = mat('#08090a')
  head.add(box(0.05, 0.06, 0.02, eyes, -0.08, 0.02, 0.175))
  head.add(box(0.05, 0.06, 0.02, eyes, 0.08, 0.02, 0.175))
  head.add(box(0.07, 0.025, 0.02, mat('#b0645a'), 0, -0.08, 0.175))
  // Hair: a cap on every style, then back / sides / bun / fringe.
  head.add(box(0.4, 0.1, 0.38, hairMat, 0, 0.19, -0.01))
  head.add(box(0.38, 0.28, 0.08, hairMat, 0, 0.02, -0.17))
  if (style === 1) { head.add(box(0.05, 0.22, 0.3, hairMat, -0.2, 0.06, -0.02)); head.add(box(0.05, 0.22, 0.3, hairMat, 0.2, 0.06, -0.02)); head.add(box(0.38, 0.5, 0.08, hairMat, 0, -0.08, -0.18)) }
  if (style === 2) head.add(box(0.14, 0.14, 0.14, hairMat, 0, 0.3, -0.08))
  if (style === 3) head.add(box(0.38, 0.07, 0.06, hairMat, 0, 0.13, 0.17))
  if (style === 0 && seed % 5 === 0) head.add(box(0.12, 0.06, 0.02, hairMat, 0, -0.06, 0.18)) // moustache
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
  canvas.width = 512
  canvas.height = 320
  // Linear, not nearest: zoomed into a monitor the text must be readable.
  const texture = new CanvasTexture(canvas)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  return { canvas, texture }
}

export function paintScreen(screen, { lines = [], color = '#8b9bb0', bg = '#07060c', title = '', sleeping = false }) {
  const ctx = screen.canvas.getContext('2d')
  const W = 512, H = 320
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7)
  v.addColorStop(0, 'rgba(255,255,255,0.035)')
  v.addColorStop(1, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, W, 30)
  ctx.fillStyle = '#0b0a10'
  ctx.font = '700 18px ui-monospace, monospace'
  ctx.fillText(title.slice(0, 40), 12, 21)
  ctx.font = '17px ui-monospace, monospace'
  if (sleeping) {
    ctx.fillStyle = '#6b6680'
    ctx.textAlign = 'center'
    ctx.fillText('sleeping · open to wake', W / 2, H / 2 + 6)
    ctx.textAlign = 'left'
  } else {
    ctx.fillStyle = '#d8d4ea'
    lines.slice(-12).forEach((line, i) => ctx.fillText(String(line).slice(0, 46), 12, 56 + i * 22))
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
  group.add(monitor, box(0.08, 0.2, 0.08, mat('#0f0e14'), 0, 0.86, -0.22), box(0.3, 0.03, 0.18, mat('#0f0e14'), 0, 0.79, -0.22))
  // Desk props: keyboard, mug, lamp, a small plant.
  group.add(box(0.5, 0.025, 0.16, mat('#16141d'), 0, 0.795, 0.12))
  group.add(box(0.1, 0.1, 0.1, mat(lift(accent, 0.2)), 0.62, 0.83, 0.05))
  group.add(box(0.03, 0.34, 0.03, mat('#2a2438'), -0.68, 0.96, -0.2))
  group.add(box(0.2, 0.08, 0.14, new MeshBasicMaterial({ color: theme.light }), -0.62, 1.15, -0.14))
  const lampPool = glow(theme.light, 1.7, 0.28, { y: 0.775 })
  lampPool.position.x = -0.55
  group.add(lampPool)
  group.add(box(0.14, 0.12, 0.14, mat('#6b4a3a'), -0.45, 0.83, 0.2), box(0.2, 0.16, 0.2, mat('#3f8f6b'), -0.45, 0.97, 0.2))
  const anchors = {}
  let screen = null
  if (desk.tabId) {
    screen = screenTexture()
    const face = new Mesh(new PlaneGeometry(0.78, 0.48), new MeshBasicMaterial({ map: screen.texture }))
    face.position.set(0, 0, 0.032)
    monitor.add(face)
    const spill = glow(accent, 2.6, 0.2)
    spill.position.set(0, 0.02, 0.9)
    group.add(spill)
    const chair = box(0.5, 0.08, 0.5, mat('#2b2638'), 0, 0.46, 0.75)
    chair.add(box(0.5, 0.55, 0.08, mat('#2b2638'), 0, 0.3, 0.22))
    chair.add(box(0.06, 0.4, 0.06, mat('#15131c'), 0, -0.22, 0), box(0.5, 0.05, 0.5, mat('#15131c'), 0, -0.42, 0))
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
  if (theme.backdrop === 'ocean') {
    // Light shafts, drifting fish silhouettes, a seabed.
    ctx.fillStyle = 'rgba(190,245,255,0.07)'
    for (let x = 10; x < 256; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 10, 0); ctx.lineTo(x + 34, 64); ctx.lineTo(x + 14, 64); ctx.fill() }
    for (let i = 0; i < 9; i++) {
      const fx = Math.floor(rand() * 240); const fy = 8 + Math.floor(rand() * 34)
      ctx.fillStyle = i % 3 ? '#8fe9ff' : '#ffb86b'
      ctx.fillRect(fx, fy, 6, 3); ctx.fillRect(fx + 6, fy - 1, 2, 5)
    }
    ctx.fillStyle = '#0a2433'; ctx.fillRect(0, 56, 256, 8)
    ctx.fillStyle = '#12445a'
    for (let x = 0; x < 256; x += 14) ctx.fillRect(x, 50 + Math.floor(rand() * 5), 3, 14)
  }
  if (theme.backdrop === 'dunes') {
    ctx.fillStyle = '#ffe3a8'; ctx.beginPath(); ctx.arc(70, 40, 14, 0, Math.PI * 2); ctx.fill()
    const ridge = (base, amp, color, k) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 64)
      for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, base + Math.sin(x / k) * amp + Math.sin(x / (k * 0.37)) * amp * 0.3)
      ctx.lineTo(256, 64); ctx.fill()
    }
    ridge(42, 6, '#b5603f', 31); ridge(50, 5, '#8a4033', 23); ridge(57, 3, '#5a2b2e', 17)
    ctx.fillStyle = '#2a1626'; ctx.fillRect(196, 36, 3, 18); ctx.fillRect(192, 42, 4, 2); ctx.fillRect(199, 40, 4, 2) // cactus
  }
  if (theme.backdrop === 'snow') {
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 50), 1, 1)
    for (let x = -6; x < 260; x += 16) {
      const h = 20 + Math.floor(rand() * 26)
      ctx.fillStyle = '#1d3a34'; ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x + 8, 64 - h); ctx.lineTo(x + 16, 64); ctx.fill()
      ctx.fillStyle = '#f2f7ff'; ctx.beginPath(); ctx.moveTo(x + 8, 64 - h); ctx.lineTo(x + 12, 64 - h + 9); ctx.lineTo(x + 4, 64 - h + 9); ctx.fill()
    }
    ctx.fillStyle = '#e6eefa'; ctx.fillRect(0, 59, 256, 5)
  }
  if (theme.backdrop === 'sakura') {
    ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.arc(190, 20, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#4a2a33'; ctx.fillRect(30, 26, 5, 38); ctx.fillRect(30, 30, 22, 3); ctx.fillRect(18, 38, 16, 3)
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? '#ff9ec0' : '#ffd1e0'
      ctx.fillRect(10 + Math.floor(rand() * 60), 8 + Math.floor(rand() * 30), 3, 2)
    }
    ctx.fillStyle = '#2b1a2a'; ctx.fillRect(0, 58, 256, 6)
    for (let i = 0; i < 24; i++) { ctx.fillStyle = '#ffb3cb'; ctx.fillRect(Math.floor(rand() * 256), 54 + Math.floor(rand() * 8), 2, 1) }
  }
  if (theme.backdrop === 'aurora') {
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 50; i++) ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 40), 1, 1)
    for (const [col, off] of [['rgba(109,255,184,0.28)', 0], ['rgba(122,184,255,0.22)', 9], ['rgba(190,120,255,0.18)', 17]]) {
      ctx.fillStyle = col
      for (let x = 0; x < 256; x += 2) {
        const y = 12 + off + Math.sin(x / 22 + off) * 7
        ctx.fillRect(x, y, 2, 22 + Math.sin(x / 9) * 6)
      }
    }
    ctx.fillStyle = '#07121c'; ctx.beginPath(); ctx.moveTo(0, 64)
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, 44 + (Math.abs(Math.sin(x / 19)) * 16))
    ctx.lineTo(256, 64); ctx.fill()
  }
  if (theme.backdrop === 'daytime') {
    ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(205, 16, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    for (const [cx, cy] of [[40, 16], [120, 26], [170, 12]]) { ctx.fillRect(cx, cy, 26, 5); ctx.fillRect(cx + 5, cy - 4, 14, 5); ctx.fillRect(cx - 4, cy + 2, 8, 4) }
    ctx.fillStyle = '#7fa6c9'; ctx.beginPath(); ctx.moveTo(0, 64)
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, 40 + Math.abs(Math.sin(x / 31)) * 14)
    ctx.lineTo(256, 64); ctx.fill()
    ctx.fillStyle = '#5f9a6d'; ctx.fillRect(0, 56, 256, 8)
  }
  return nearest(new CanvasTexture(canvas))
}

// ── Ambient particles ─────────────────────────────────────────────────────
// A cheap Points cloud per theme (snow, petals, bubbles, fireflies…). Static
// when reduce-motion is on (the caller skips `update`).
const FX = {
  dust: { count: 36, color: '#ffffff', size: 0.045, opacity: 0.35, vy: 0.02, sway: 0.05 },
  snow: { count: 160, color: '#ffffff', size: 0.09, opacity: 0.85, vy: -0.9, sway: 0.35 },
  petals: { count: 70, color: '#ffb3cb', size: 0.1, opacity: 0.9, vy: -0.55, sway: 0.7 },
  bubbles: { count: 60, color: '#bff4ff', size: 0.08, opacity: 0.6, vy: 0.45, sway: 0.25 },
  fireflies: { count: 40, color: '#e6ff8a', size: 0.09, opacity: 0.95, vy: 0, sway: 0.5, twinkle: true },
  embers: { count: 50, color: '#ffb36b', size: 0.07, opacity: 0.85, vy: 0.3, sway: 0.3 },
  rain: { count: 220, color: '#7fe9ff', size: 0.05, opacity: 0.55, vy: -9, sway: 0 },
  stars: { count: 70, color: '#ffffff', size: 0.07, opacity: 0.8, vy: 0, sway: 0.02, twinkle: true }
}

// `area` is the world rectangle to fill: { minX, maxX, minZ, maxZ, top }.
export function buildParticles(kind, area) {
  const cfg = FX[kind]
  if (!cfg) return null
  const w = area.maxX - area.minX
  const d = area.maxZ - area.minZ
  const h = area.top
  const n = Math.max(8, Math.round(cfg.count * Math.min(2.5, Math.max(0.5, (w * d) / 260))))
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  let r = 11
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
  for (let i = 0; i < n; i++) {
    pos[i * 3] = area.minX + rand() * w
    pos[i * 3 + 1] = rand() * h
    pos[i * 3 + 2] = area.minZ + rand() * d
    seed[i] = rand() * Math.PI * 2
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  const material = new PointsMaterial({ color: cfg.color, size: cfg.size, sizeAttenuation: true, transparent: true, opacity: cfg.opacity, depthWrite: false, ...(kind === 'rain' ? { blending: AdditiveBlending } : {}) })
  const points = new Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 3
  const update = (t, dt) => {
    for (let i = 0; i < n; i++) {
      const o = i * 3
      pos[o] += Math.sin(t * 0.7 + seed[i]) * cfg.sway * dt
      pos[o + 2] += Math.cos(t * 0.6 + seed[i] * 1.3) * cfg.sway * dt
      pos[o + 1] += cfg.vy * dt
      if (pos[o + 1] < 0) pos[o + 1] += h
      else if (pos[o + 1] > h) pos[o + 1] -= h
      if (pos[o] < area.minX) pos[o] += w; else if (pos[o] > area.maxX) pos[o] -= w
      if (pos[o + 2] < area.minZ) pos[o + 2] += d; else if (pos[o + 2] > area.maxZ) pos[o + 2] -= d
    }
    geo.attributes.position.needsUpdate = true
    if (cfg.twinkle) material.opacity = cfg.opacity * (0.7 + 0.3 * Math.sin(t * 3))
  }
  return { points, update }
}


// ── Interior dressing ─────────────────────────────────────────────────────
const basic = color => new MeshBasicMaterial({ color })

function plant(scale = 1) {
  const g = new Group()
  g.add(box(0.42, 0.4, 0.42, mat('#8a5a46'), 0, 0.2, 0), box(0.46, 0.06, 0.46, mat('#a56f58'), 0, 0.42, 0))
  g.add(box(0.1, 0.3, 0.1, mat('#4a3526'), 0, 0.6, 0))
  g.add(box(0.55, 0.4, 0.55, mat('#2f6b4a'), 0, 0.85, 0), box(0.4, 0.4, 0.4, mat('#3f8f6b'), 0.05, 1.2, -0.04), box(0.22, 0.3, 0.22, mat('#58b184'), -0.03, 1.5, 0.03))
  g.scale.setScalar(scale)
  return g
}

function sofa(theme, accent) {
  const g = new Group()
  const fabric = mat(lift(theme.wall, 0.12))
  g.add(box(2.4, 0.4, 1.0, fabric, 0, 0.3, 0))
  g.add(box(2.4, 0.6, 0.24, fabric, 0, 0.7, -0.38))
  g.add(box(0.22, 0.55, 1.0, fabric, -1.2, 0.5, 0), box(0.22, 0.55, 1.0, fabric, 1.2, 0.5, 0))
  g.add(box(0.7, 0.14, 0.7, mat(lift(theme.wall, 0.22)), -0.5, 0.57, 0.05), box(0.7, 0.14, 0.7, mat(lift(theme.wall, 0.22)), 0.5, 0.57, 0.05))
  const pillow = box(0.4, 0.4, 0.14, mat(accent), 0.8, 0.85, -0.1)
  pillow.rotation.z = 0.25
  g.add(pillow)
  return g
}

function shelf(theme) {
  const g = new Group()
  const wood = mat(theme.desk)
  g.add(box(2.6, 1.9, 0.12, mat('#0f0e14'), 0, 0.95, -0.2))
  for (const y of [0.02, 0.62, 1.22, 1.85]) g.add(box(2.6, 0.06, 0.5, wood, 0, y, 0))
  g.add(box(0.06, 1.9, 0.5, wood, -1.3, 0.95, 0), box(0.06, 1.9, 0.5, wood, 1.3, 0.95, 0))
  const cols = ['#ff6b9d', '#7ab8ff', '#ffd08a', '#9ad48a', '#b79cff', '#e9dcff']
  let n = 1
  for (const y of [0.35, 0.95, 1.55]) {
    let x = -1.15
    while (x < 1.0) {
      n = (n * 37 + 11) % 97
      const bw = 0.09 + (n % 3) * 0.04
      const bh = 0.32 + (n % 4) * 0.06
      if (n % 7 !== 0) g.add(box(bw, bh, 0.28, mat(cols[n % cols.length]), x, y - 0.3 + bh / 2 + 0.03, 0))
      x += bw + 0.03
    }
  }
  return g
}

function counter(theme, accent) {
  const g = new Group()
  g.add(box(1.7, 0.9, 0.7, mat(theme.desk), 0, 0.45, 0), box(1.76, 0.06, 0.76, mat(lift(theme.desk, 0.3)), 0, 0.93, 0))
  // Coffee machine + cups + a status light.
  g.add(box(0.4, 0.5, 0.3, mat('#15131c'), -0.45, 1.2, -0.1), box(0.3, 0.05, 0.2, mat('#2a2438'), -0.45, 1.05, 0.0))
  g.add(box(0.06, 0.06, 0.02, basic(accent), -0.3, 1.38, 0.06))
  g.add(box(0.1, 0.1, 0.1, mat('#e9dcff'), 0.1, 1.03, 0.1), box(0.1, 0.1, 0.1, mat('#e9dcff'), 0.3, 1.03, 0.0))
  g.add(box(0.5, 0.18, 0.3, mat('#2a2438'), 0.55, 1.05, -0.1))
  return g
}

function floorLamp(theme) {
  const g = new Group()
  g.add(box(0.3, 0.05, 0.3, mat('#15131c'), 0, 0.03, 0), box(0.05, 1.5, 0.05, mat('#2a2438'), 0, 0.78, 0))
  g.add(box(0.36, 0.3, 0.36, basic(theme.light), 0, 1.6, 0))
  g.add(glow(theme.light, 3.4, 0.3, { y: 0.03 }))
  return g
}

function neonSign(text, accent) {
  const c = canvasOf(256, 64)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 256, 64)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = 38
  const font = px => `800 ${px}px Inter, system-ui, sans-serif`
  ctx.font = font(size)
  while (ctx.measureText(text).width > 236 && size > 14) { size -= 2; ctx.font = font(size) }
  ctx.shadowColor = accent; ctx.shadowBlur = 10
  ctx.fillStyle = accent
  ctx.fillText(text, 128, 34)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fff3f8'
  ctx.globalAlpha = 0.9
  ctx.fillText(text, 128, 34)
  const tex = nearest(new CanvasTexture(c))
  tex.minFilter = tex.magFilter = LinearFilter // text stays smooth
  return tex
}

function whiteboard(label, accent) {
  const c = canvasOf(128, 64)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#e9e6f2'; ctx.fillRect(0, 0, 128, 64)
  ctx.fillStyle = accent
  ctx.fillRect(8, 8, 48, 4)
  ctx.fillStyle = '#6b6680'
  for (let i = 0; i < 4; i++) { ctx.fillRect(10, 20 + i * 9, 5, 5); ctx.fillRect(20, 21 + i * 9, 26 + ((i * 17) % 20), 3) }
  ctx.fillStyle = accent; ctx.fillRect(10, 20, 5, 5); ctx.fillRect(10, 29, 5, 5)
  ctx.strokeStyle = '#4b6bd6'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(84, 52); ctx.lineTo(94, 36); ctx.lineTo(104, 44); ctx.lineTo(118, 20); ctx.stroke()
  return nearest(new CanvasTexture(c))
}

function artTexture(seed, theme, accent) {
  const c = canvasOf(24, 32)
  const ctx = c.getContext('2d')
  ctx.fillStyle = lift(theme.wall, 0.5); ctx.fillRect(0, 0, 24, 32)
  const cols = [accent, theme.light, theme.trim === 'accent' ? '#7ab8ff' : theme.trim, '#2a2438']
  let n = seed + 3
  for (let i = 0; i < 5; i++) {
    n = (n * 53 + 17) % 101
    ctx.fillStyle = cols[i % cols.length]
    ctx.fillRect(2 + (n % 12), 2 + ((n * 3) % 20), 6 + (n % 8), 5 + (n % 9))
  }
  return nearest(new CanvasTexture(c))
}

export function buildInteriorDecor({ room, meeting, doorW, theme, accent, label }) {
  const g = new Group()
  const w = room.maxX - room.minX
  const wallZ = room.minZ
  const trimColor = theme.trim === 'accent' ? accent : theme.trim
  // Furniture.
  for (const it of interiorDecor(room, meeting, doorW).items) {
    let m = null
    if (it.type === 'sofa') m = sofa(theme, accent)
    else if (it.type === 'shelf') m = shelf(theme)
    else if (it.type === 'counter') m = counter(theme, accent)
    else if (it.type === 'lamp') m = floorLamp(theme)
    else if (it.type === 'plant') m = plant(0.95 + ((Math.abs(it.x * 7 + it.z * 3) | 0) % 3) * 0.12)
    else if (it.type === 'coffeetable') {
      m = new Group()
      m.add(box(0.9, 0.06, 1.4, mat(theme.desk), 0, 0.4, 0), box(0.08, 0.38, 0.08, mat('#15131c'), -0.35, 0.19, -0.6), box(0.08, 0.38, 0.08, mat('#15131c'), 0.35, 0.19, 0.6), box(0.08, 0.38, 0.08, mat('#15131c'), 0.35, 0.19, -0.6), box(0.08, 0.38, 0.08, mat('#15131c'), -0.35, 0.19, 0.6))
      m.add(box(0.3, 0.04, 0.4, mat(accent), 0, 0.45, 0.1), box(0.1, 0.1, 0.1, mat('#e9dcff'), 0.2, 0.5, -0.3))
    }
    if (!m) continue
    m.position.set(it.x, 0, it.z)
    m.rotation.y = it.rot || 0
    g.add(m)
  }
  // Rugs: one under the lounge, one under the meeting table.
  const lounge = new Mesh(new PlaneGeometry(3.6, 3.4), new MeshLambertMaterial({ map: rugTexture(lift(theme.rug, 0.06), accent) }))
  lounge.rotation.x = -Math.PI / 2
  lounge.position.set(room.minX + 2.3, 0.012, meeting.z + 0.2)
  g.add(lounge)
  const mr = new Mesh(new PlaneGeometry(meeting.size + 2.4, meeting.size + 2.4), new MeshLambertMaterial({ map: rugTexture(lift(theme.rug, 0.1), trimColor) }))
  mr.rotation.x = -Math.PI / 2
  mr.position.set(meeting.x, 0.012, meeting.z)
  g.add(mr)

  // Back wall: window frame + mullions, neon sign, whiteboard, sconces, art.
  const winW = w * 0.5
  const frame = mat(lift(theme.wall, 0.25))
  g.add(box(winW + 0.2, 0.1, 0.12, frame, 0, 2.12, wallZ + 0.04), box(winW + 0.2, 0.14, 0.2, frame, 0, 0.78, wallZ + 0.06))
  g.add(box(0.1, 1.4, 0.12, frame, -winW / 2 - 0.05, 1.45, wallZ + 0.04), box(0.1, 1.4, 0.12, frame, winW / 2 + 0.05, 1.45, wallZ + 0.04))
  for (let i = 1; i < 4; i++) g.add(box(0.06, 1.3, 0.1, frame, -winW / 2 + (winW * i) / 4, 1.45, wallZ + 0.05))
  const spill = glow(theme.sky[1] === theme.sky[0] ? theme.light : theme.sky[1], 6, 0.25, { y: 0.02 })
  spill.scale.set(winW / 6, 1, 1)
  spill.scale.y = 0.55 // plane is rotated flat: y-scale = z extent... applied pre-rotation
  spill.position.set(0, 0.02, wallZ + 1.8)
  g.add(spill)
  const sx = w * 0.375
  const sign = new Mesh(new PlaneGeometry(3, 0.75), new MeshBasicMaterial({ map: neonSign(label || 'Office', accent), transparent: true, depthWrite: false }))
  sign.position.set(-sx, 1.5, wallZ + 0.03)
  g.add(sign)
  const halo = glow(accent, 3.8, 0.35, { wall: true, y: 1.5 })
  halo.scale.set(1.1, 0.5, 1)
  halo.position.set(-sx, 1.5, wallZ + 0.025)
  g.add(halo)
  const floorHalo = glow(accent, 4.5, 0.12, { y: 0.02 })
  floorHalo.position.set(-sx, 0.02, wallZ + 1.8)
  g.add(floorHalo)
  const board = new Mesh(new PlaneGeometry(2.3, 1.15), new MeshBasicMaterial({ map: whiteboard(label, accent) }))
  board.position.set(sx, 1.4, wallZ + 0.03)
  g.add(board)
  g.add(box(2.4, 0.06, 0.08, mat('#2a2438'), sx, 0.8, wallZ + 0.05), box(2.4, 0.06, 0.06, mat('#2a2438'), sx, 2.0, wallZ + 0.04))
  for (const side of [-1, 1]) {
    const x = side * (winW / 2 + 0.55)
    g.add(box(0.14, 0.3, 0.14, mat('#15131c'), x, 1.7, wallZ + 0.1), box(0.2, 0.14, 0.2, basic(theme.light), x, 1.5, wallZ + 0.14))
    const sc = glow(theme.light, 1.6, 0.4, { wall: true, y: 1.5 })
    sc.position.set(x, 1.55, wallZ + 0.03)
    g.add(sc)
  }
  // Side walls: framed art and a skirting board all round.
  for (const side of [-1, 1]) {
    const wx = side < 0 ? room.minX : room.maxX
    for (const [i, z] of [[0, room.minZ + 3.2], [1, meeting.z - 3]]) {
      if (z > room.maxZ - 2) continue
      const art = new Mesh(new PlaneGeometry(0.9, 1.2), new MeshBasicMaterial({ map: artTexture(i + (side > 0 ? 5 : 0), theme, accent) }))
      art.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
      art.position.set(wx - side * 0.02, 1.35, z)
      g.add(art)
    }
    g.add(box(0.06, 0.16, room.maxZ - room.minZ, mat(lift(theme.wall, 0.18)), wx - side * 0.03, 0.08, 0))
  }
  g.add(box(w, 0.16, 0.06, mat(lift(theme.wall, 0.18)), 0, 0.08, wallZ + 0.03))
  return g
}

// ── Campus pieces ─────────────────────────────────────────────────────────
export function buildBuilding(building, theme, accent) {
  const group = new Group()
  group.position.set(building.x, 0, building.z)
  const h = 4.2
  const trim = theme.trim === 'accent' ? accent : theme.trim
  const wallC = lift(theme.wall, 0.16)
  const front = building.d / 2
  group.add(box(building.w, h, building.d, mat(wallC), 0, h / 2, 0))
  // Plinth + roof slab with an accent parapet rim and rooftop kit.
  group.add(box(building.w + 0.2, 0.3, building.d + 0.2, mat(lift(theme.wall, 0.06)), 0, 0.15, 0))
  group.add(box(building.w + 0.3, 0.25, building.d + 0.3, mat(lift(theme.wall, 0.04)), 0, h + 0.12, 0))
  const rim = mat(trim)
  group.add(box(building.w + 0.3, 0.12, 0.12, rim, 0, h + 0.3, front + 0.12), box(building.w + 0.3, 0.12, 0.12, rim, 0, h + 0.3, -front - 0.12))
  group.add(box(0.12, 0.12, building.d + 0.3, rim, -building.w / 2 - 0.12, h + 0.3, 0), box(0.12, 0.12, building.d + 0.3, rim, building.w / 2 + 0.12, h + 0.3, 0))
  group.add(box(1.4, 0.7, 1.0, mat('#3a3550'), -building.w / 2 + 1.5, h + 0.6, -0.8), box(1.0, 0.5, 0.8, mat('#2f2a44'), building.w / 2 - 1.6, h + 0.5, -1.4))
  group.add(box(0.1, 1.1, 0.1, mat('#2a2438'), building.w / 2 - 1.2, h + 0.8, 1.0), box(0.4, 0.06, 0.06, basic(trim), building.w / 2 - 1.2, h + 1.38, 1.0))
  // Door: frame, glowing doorway, awning.
  group.add(box(1.9, 2.4, 0.12, mat(lift(theme.wall, 0.3)), 0, 1.2, front + 0.01))
  group.add(box(1.6, 2.2, 0.1, mat('#0a0910'), 0, 1.1, front + 0.05))
  group.add(box(1.0, 1.8, 0.04, basic(theme.light), 0, 1.0, front + 0.09))
  group.add(box(2.4, 0.16, 0.9, rim, 0, 2.5, front + 0.4))
  const doorGlow = glow(theme.light, 4.5, 0.3, { y: 0.03 })
  doorGlow.position.set(0, 0.03, front + 1.6)
  group.add(doorGlow)
  // One window per agent (up to 12) — lit by that agent's live state.
  const windows = []
  const count = Math.min(12, Math.max(1, building.agents.length))
  const cols = Math.min(6, count)
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = (col - (cols - 1) / 2) * 1.2
    const y = 3.35 - row * 0.8
    group.add(box(0.84, 0.69, 0.06, mat(lift(theme.wall, 0.35)), x, y, front + 0.01))
    const win = new Mesh(new PlaneGeometry(0.7, 0.55), new MeshBasicMaterial({ color: '#2a2438' }))
    win.position.set(x, y, front + 0.05)
    group.add(win)
    windows.push({ mesh: win, tabId: building.agents[i]?.tabId || null })
  }
  // Lamp posts either side of the door, each with a light pool.
  for (const side of [-1, 1]) {
    group.add(box(0.12, 1.4, 0.12, mat('#2a2438'), side * 1.7, 0.7, front + 0.9))
    group.add(box(0.26, 0.26, 0.26, basic(theme.light), side * 1.7, 1.5, front + 0.9))
    const pool = glow(theme.light, 2.8, 0.32, { y: 0.03 })
    pool.position.set(side * 1.7, 0.03, front + 0.9)
    group.add(pool)
  }
  // Planters at the corners of the facade.
  for (const side of [-1, 1]) {
    group.add(box(0.6, 0.4, 0.5, mat('#6b4a3a'), side * (building.w / 2 - 0.5), 0.2, front + 0.5))
    group.add(box(0.5, 0.5, 0.4, mat('#3f8f6b'), side * (building.w / 2 - 0.5), 0.65, front + 0.5))
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

export function buildLampPost(x, z, theme) {
  const g = new Group()
  g.add(box(0.1, 1.8, 0.1, mat('#2a2438'), 0, 0.9, 0), box(0.3, 0.3, 0.3, basic(theme.light), 0, 1.9, 0))
  g.add(glow(theme.light, 3.4, 0.3, { y: 0.03 }))
  g.position.set(x, 0, z)
  return g
}

export function buildBench(x, z, accent) {
  const g = new Group()
  g.add(box(1.5, 0.1, 0.5, mat('#6b4a3a'), 0, 0.45, 0), box(1.5, 0.4, 0.08, mat('#6b4a3a'), 0, 0.7, -0.24))
  g.add(box(0.08, 0.45, 0.4, mat('#2a2438'), -0.65, 0.22, 0), box(0.08, 0.45, 0.4, mat('#2a2438'), 0.65, 0.22, 0))
  g.add(box(0.3, 0.05, 0.2, mat(accent), 0.3, 0.52, 0))
  g.position.set(x, 0, z)
  return g
}

export function buildFlowers(x, z, accent) {
  const g = new Group()
  g.add(box(1.6, 0.3, 0.7, mat('#4a3526'), 0, 0.15, 0))
  const cols = [accent, '#ffd08a', '#b79cff', '#ffffff']
  for (let i = 0; i < 8; i++) g.add(box(0.12, 0.12, 0.12, mat(cols[i % cols.length]), -0.65 + i * 0.185, 0.36 + (i % 3) * 0.04, ((i * 5) % 3 - 1) * 0.16))
  g.position.set(x, 0, z)
  return g
}

export function skyTexture(theme) {
  const c = canvasOf(8, 128)
  const ctx = c.getContext('2d')
  const gr = ctx.createLinearGradient(0, 0, 0, 128)
  if (theme) {
    gr.addColorStop(0, theme.sky[0]); gr.addColorStop(0.55, theme.sky[1]); gr.addColorStop(1, theme.fog)
  } else {
    gr.addColorStop(0, '#070510'); gr.addColorStop(0.55, '#1a1230'); gr.addColorStop(1, '#3a1f4a')
  }
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 8, 128)
  const tex = new CanvasTexture(c)
  tex.magFilter = tex.minFilter = LinearFilter
  return tex
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
    // Shared textures (the glow disc) outlive any one world rebuild.
    for (const m of materials) { if (!m.map?.userData?.shared) m.map?.dispose?.(); m.dispose?.() }
  })
}

export { WALL_H, WALL_T }

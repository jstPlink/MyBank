// Palette per il tema vetro: applica la scelta a <body class="vt"> e la ricorda in localStorage.
export const PALETTES = [["grafite","Grafite","#e9ebef","#0e1012"],["ambra","Ambra","#f0b45a","#101010"],["salvia","Salvia","#9fd8b8","#0f1211"],["ghiaccio","Ghiaccio","#a9c8e8","#0e1114"],["lime","Lime","#c9f36b","#0b0c0b"],["turchese","Turchese","#5ee6d0","#0b0e0f"],["arancio","Arancio","#ff8a3d","#0d0b0a"],["smeraldo","Smeraldo","#3ddc97","#08100d"]]; // [chiave, nome, colore d'accento, fondo]
const KEY = 'palette';
export function currentPalette() { let v = ''; try { v = localStorage.getItem(KEY) ?? ''; } catch {} return PALETTES.some((p) => p[0] === v) ? v : PALETTES[0][0]; }
export function applyPalette(name = currentPalette()) { document.body.dataset.pal = name; try { localStorage.setItem(KEY, name); } catch {} }
// Selettore pronto: riempie `container` con un pulsante per palette (quella scelta è piena).
export function palettePicker(container) {
  const draw = () => { const cur = currentPalette(); container.innerHTML = PALETTES.map(([k, n, acc]) => `<button type="button" class="vt-btn${k === cur ? ' vt-btn-primary' : ''}" data-pal="${k}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${acc};margin-right:8px"></span>${n}</button>`).join(''); };
  container.addEventListener('click', (e) => { const b = e.target.closest('[data-pal]'); if (b) { applyPalette(b.dataset.pal); draw(); } });
  draw();
}
document.addEventListener('DOMContentLoaded', () => applyPalette());

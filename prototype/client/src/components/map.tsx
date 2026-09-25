// Leaflet + OneMap basemap (tech-stack recommendation). Markers are keyboard-focusable; every map has a list alternative.
import L from 'leaflet';
import { TileLayer } from 'react-leaflet';
import { AMENITY_ICONS, AMENITY_LABELS, type AmenityCategory } from '@famplan/shared';

export const SG_CENTER: [number, number] = [1.3521, 103.8198];
export const SG_BOUNDS = L.latLngBounds([1.16, 103.58], [1.48, 104.1]);

export function OneMapTiles() {
  return (
    <TileLayer
      url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
      detectRetina
      maxZoom={19}
      minZoom={11}
      attribution='<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;" alt=""/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
    />
  );
}

/** Distinguishable by colour AND icon glyph (not colour alone). */
export const CATEGORY_COLORS: Record<AmenityCategory, string> = {
  childcare: '#b23a48',
  kindergarten: '#d9534f',
  primary_school: '#461220',
  secondary_school: '#7a3b52',
  supermarket: '#1d6b3a',
  clinic: '#0b5c8a',
  park_playground: '#4c7a1e',
  mrt: '#6a1b9a',
  bus_stop: '#8a4b00',
};

const iconCache = new Map<string, L.DivIcon>();
export function categoryIcon(c: AmenityCategory, size = 26): L.DivIcon {
  const key = `${c}:${size}`;
  if (!iconCache.has(key))
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        html: `<div class="fp-marker" style="width:${size}px;height:${size}px;background:${CATEGORY_COLORS[c]}"><span class="material-symbols-outlined">${AMENITY_ICONS[c]}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    );
  return iconCache.get(key)!;
}

export function pinIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="fp-pin" style="background:${color};border-top-color:${color}">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 6],
  });
}

export function homeIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="fp-marker" style="width:34px;height:34px;background:#461220"><span class="material-symbols-outlined" style="font-size:20px">home</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function CategoryLegend({ categories }: { categories: AmenityCategory[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Map legend">
      {categories.map((c) => (
        <li key={c} className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: CATEGORY_COLORS[c] }}>
            <span className="material-symbols-outlined !text-[11px]">{AMENITY_ICONS[c]}</span>
          </span>
          {AMENITY_LABELS[c]}
        </li>
      ))}
    </ul>
  );
}

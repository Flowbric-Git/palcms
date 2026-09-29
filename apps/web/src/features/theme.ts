export const FONTS = ['system', 'Inter', 'Poppins', 'Nunito', 'Rajdhani', 'Orbitron'] as const;

export interface ThemeSettings {
  font: (typeof FONTS)[number];
  background: 'plain' | 'gradient' | 'dots' | 'image';
  backgroundImage: string;
  glass: boolean;
  customCss: string;
}

// Le panel admin garde un style sobre : les effets ne s'appliquent qu'au site public.
const PUBLIC = 'body:not(.palcms-admin)';

function styleTag(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, '')}")`;

export function applyTheme(t: ThemeSettings): void {
  // Police (Google Fonts)
  document.getElementById('palcms-theme-font')?.remove();
  if (t.font !== 'system') {
    const link = document.createElement('link');
    link.id = 'palcms-theme-font';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(t.font)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }

  const rules: string[] = [];
  if (t.font !== 'system') rules.push(`body { font-family: '${t.font}', system-ui, sans-serif; }`);

  if (t.background === 'gradient') {
    rules.push(
      `${PUBLIC} { background-image: radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 22%, transparent), transparent 65%); background-attachment: fixed; }`,
    );
  } else if (t.background === 'dots') {
    rules.push(
      `${PUBLIC} { background-image: radial-gradient(color-mix(in srgb, var(--accent) 30%, transparent) 1px, transparent 1px); background-size: 22px 22px; }`,
    );
  } else if (t.background === 'image' && t.backgroundImage) {
    rules.push(
      `${PUBLIC} { background-image: linear-gradient(rgb(255 255 255 / .8), rgb(255 255 255 / .8)), ${cssUrl(t.backgroundImage)}; background-size: cover; background-position: center; background-attachment: fixed; }`,
      `.dark ${PUBLIC} { background-image: linear-gradient(rgb(2 6 23 / .78), rgb(2 6 23 / .78)), ${cssUrl(t.backgroundImage)}; }`,
    );
  }

  if (t.glass) {
    rules.push(
      `${PUBLIC} main section.rounded-xl { background-color: rgb(255 255 255 / .7) !important; backdrop-filter: blur(12px); }`,
      `.dark ${PUBLIC} main section.rounded-xl { background-color: rgb(15 23 42 / .55) !important; }`,
    );
  }

  styleTag('palcms-theme-theme').textContent = rules.join('\n');
  styleTag('palcms-theme-custom').textContent = t.customCss ? `@scope (${PUBLIC}) {\n${t.customCss}\n}` : '';
}

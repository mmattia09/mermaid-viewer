export const themes = {
  ocean: { dark: false, bg: '#f1f7fa', bar: '#e7f0f5', fg: '#19394b', dim: '#527181', line: '#c1d4df', accent: '#147b9e', btn: '#f8fbfd', hover: '#d8e8f0', grid: '#e0ecf2' },
  plum: { dark: true, bg: '#241e2c', bar: '#2d2636', fg: '#eee5f5', dim: '#b5a4c5', line: '#4b3d59', accent: '#ba91e0', btn: '#352b40', hover: '#443550', grid: '#302737' },
  sand: { dark: false, bg: '#faf7f0', bar: '#f0eadf', fg: '#493e2d', dim: '#82735d', line: '#d9ceba', accent: '#9a671e', btn: '#fffdf8', hover: '#e9dfcd', grid: '#eee7da' },
  graphite: { dark: true, bg: '#202224', bar: '#292c2f', fg: '#e0e3e6', dim: '#a2a9af', line: '#464b50', accent: '#8cb7d5', btn: '#303438', hover: '#3d4247', grid: '#2b2e31' },
};

export function mermaidColors(palette) {
  const t = themes[palette];
  if (!t) return undefined;
  return {
    darkMode: t.dark, background: t.bg, primaryColor: t.bar,
    primaryTextColor: t.fg, primaryBorderColor: t.dim, lineColor: t.dim,
    secondaryColor: t.btn, tertiaryColor: t.hover, textColor: t.fg,
    mainBkg: t.bar, nodeBorder: t.dim, clusterBkg: t.hover, clusterBorder: t.line,
    edgeLabelBackground: t.bg, actorBkg: t.bar, actorBorder: t.dim,
    actorTextColor: t.fg, signalColor: t.fg, signalTextColor: t.fg,
  };
}

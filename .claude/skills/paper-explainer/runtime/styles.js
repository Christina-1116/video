/* Paper Explainer — style packs + icon library.
 * A style pack = palette + fonts + how titles / captions / labels / backgrounds / shadows look.
 * Stories pick one with meta.style and may override any key with meta.palette / meta.styleOverrides.
 */
(function () {
  const S = {};

  // ------------------------------------------------------------------ styles
  S.styles = {
    // Ref A — zine collage: grey grain paper, halftone cut-outs, torn mustard title strips, hard offset shadows
    collage: {
      label: 'Collage zine',
      palette: {
        bg: '#d9d7d2', paper: '#ecebe7', card: '#f4f2ee', ink: '#151515', muted: '#55524c',
        accent: '#d8a72a', accent2: '#22958a', accent3: '#151515', red: '#c8553d', blue: '#3c6e91', green: '#5d8a4f',
        caption: '#151515', captionText: '#ffffff', shadow: '#151515'
      },
      fonts: {
        title: '"Roboto Slab", "Rockwell", "Georgia", serif', body: '"Inter", "Helvetica Neue", Arial, sans-serif',
        mono: '"Space Mono", "JetBrains Mono", Menlo, monospace', label: '"Roboto Slab", Georgia, serif'
      },
      googleFonts: 'family=Roboto+Slab:wght@600;800&family=Inter:wght@400;600;700&family=Space+Mono:wght@700',
      titleVariant: 'strip',      // torn paper strip behind the title
      kickerVariant: 'chip',      // black chip, white uppercase
      shadow: 'hard',             // hard offset shadow
      torn: 3.2,                  // default torn-edge amplitude for cards
      grain: 0.55,
      bgVariant: 'paper',
      decor: 'collage',
      captionVariant: 'block',
      labelVariant: 'chip',
      music: { mood: 'documentary' }
    },
    // Ref B — papercraft geometry: cream paper, torn scraps in corners, serif title card with red bar
    papercraft: {
      label: 'Papercraft',
      palette: {
        bg: '#e9dfcf', paper: '#faf6ef', card: '#fbf8f2', ink: '#2c3438', muted: '#6b6f6c',
        accent: '#e3a93b', accent2: '#6e93a3', accent3: '#7e9a73', red: '#c8553d', blue: '#6e93a3', green: '#7e9a73',
        caption: '#2f3b40', captionText: '#ffffff', shadow: '#5b4a35', scrap1: '#8faab4', scrap2: '#a9b89a', scrap3: '#e7c46e'
      },
      fonts: {
        title: '"Libre Baskerville", "Baskerville", Georgia, serif', body: '"Inter", "Helvetica Neue", Arial, sans-serif',
        mono: '"JetBrains Mono", Menlo, monospace', label: '"Libre Baskerville", Georgia, serif'
      },
      googleFonts: 'family=Libre+Baskerville:ital,wght@0,400;0,700;1,700&family=Inter:wght@400;600;700',
      titleVariant: 'card', kickerVariant: 'plain', shadow: 'soft', torn: 1.6, grain: 0.35,
      bgVariant: 'paper', decor: 'scraps', captionVariant: 'chip', labelVariant: 'card',
      music: { mood: 'calm' }
    },
    // Ref C — paper map: sage board with blob terrain + trees, layered paper rivers, white label cards
    papermap: {
      label: 'Paper map',
      palette: {
        bg: '#ede4d3', paper: '#a3b38c', card: '#fbf8f1', ink: '#28323a', muted: '#5f6a63',
        accent: '#e8c26a', accent2: '#6e93a8', accent3: '#c98a55', red: '#c8553d', blue: '#6e93a8', green: '#7f9a6c',
        land1: '#b4c39d', land2: '#93a77c', tree: '#6f8a5a', trunk: '#7a5a3c', water: '#6e93a8', bank: '#c98a55', sand: '#e8c26a',
        caption: '#2f3b40', captionText: '#ffffff', shadow: '#3d4a33'
      },
      fonts: {
        title: '"Libre Baskerville", Georgia, serif', body: '"Inter", "Helvetica Neue", Arial, sans-serif',
        mono: '"JetBrains Mono", Menlo, monospace', label: '"Inter", "Helvetica Neue", Arial, sans-serif'
      },
      googleFonts: 'family=Libre+Baskerville:wght@400;700&family=Inter:wght@400;600;700',
      titleVariant: 'card', kickerVariant: 'plain', shadow: 'soft', torn: 2.2, grain: 0.4,
      bgVariant: 'board', decor: 'map', captionVariant: 'chip', labelVariant: 'card',
      music: { mood: 'warm' }
    },
    // Deep-blue engineering paper (aviation, engineering, technical topics)
    blueprint: {
      label: 'Blueprint paper',
      palette: {
        bg: '#1f3b5c', paper: '#e8eef5', card: '#f4f7fb', ink: '#0f2236', muted: '#a9bccf',
        accent: '#ffd166', accent2: '#7fb3e0', accent3: '#9fd3c7', red: '#ff7a59', blue: '#7fb3e0', green: '#9fd3c7',
        caption: '#0b1a2b', captionText: '#ffffff', shadow: '#081422', scrap1: '#2c4f75', scrap2: '#2a4866', scrap3: '#365c84'
      },
      fonts: { title: '"Libre Baskerville", Georgia, serif', body: '"Inter", Arial, sans-serif', mono: '"JetBrains Mono", monospace', label: '"Libre Baskerville", Georgia, serif' },
      googleFonts: 'family=Libre+Baskerville:wght@400;700&family=Inter:wght@400;600;700',
      titleVariant: 'card', kickerVariant: 'plain', shadow: 'soft', torn: 1.6, grain: 0.3,
      bgVariant: 'paper', decor: 'scraps', captionVariant: 'chip', labelVariant: 'card',
      music: { mood: 'calm' }
    },
    // Extra preset — dark ink & neon paper (shows how a new style is composed from the same parts)
    nightpaper: {
      label: 'Night paper',
      palette: {
        bg: '#1d2230', paper: '#2a3042', card: '#f3eee4', ink: '#f3eee4', muted: '#a6adbd',
        accent: '#ffb547', accent2: '#5cc8c0', accent3: '#ef6f6c', red: '#ef6f6c', blue: '#7aa2ff', green: '#7fd18b',
        caption: '#0f121a', captionText: '#ffffff', shadow: '#000000', scrap1: '#33405a', scrap2: '#2c3a40', scrap3: '#4a3b2a'
      },
      fonts: {
        title: '"Fraunces", Georgia, serif', body: '"Inter", Arial, sans-serif', mono: '"JetBrains Mono", monospace', label: '"Inter", Arial, sans-serif'
      },
      googleFonts: 'family=Fraunces:wght@600;800&family=Inter:wght@400;600;700',
      titleVariant: 'plain', kickerVariant: 'plain', shadow: 'soft', torn: 1.8, grain: 0.3,
      bgVariant: 'paper', decor: 'scraps', captionVariant: 'chip', labelVariant: 'card',
      music: { mood: 'calm' }
    }
  };

  // ------------------------------------------------------------------ icons (24×24, stroke paths, original drawings)
  S.icons = {
    search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z M15.3 15.3L21 21',
    check: 'M5 12.5l4.2 4.2L19 7',
    lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 14.5v2.5',
    bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.4-1.1 2.2V16h-5v-.0c0-.8-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z',
    star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
    pin: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z M12 7.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5z',
    camera: 'M4 8h3l2-2.5h6L17 8h3v11H4z M12 10.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7z',
    mail: 'M3.5 6h17v12h-17z M3.5 6.5l8.5 7 8.5-7',
    phone: 'M7 3h10v18H7z M10.5 18.5h3 M9.5 5.5h5',
    house: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
    globe: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z M3 12h18 M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
    chat: 'M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5',
    doc: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 15.5h6',
    coin: 'M12 4a8 8 0 1 1 0 16a8 8 0 0 1 0-16z M12 7.5v9 M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6',
    card: 'M3 6h18v12H3z M3 10h18 M6 14.5h4',
    bank: 'M3 9l9-5 9 5 M5 10v7 M9.5 10v7 M14.5 10v7 M19 10v7 M3 20h18',
    chart: 'M4 20V4 M4 20h16 M7 15l4-4 3 3 5-6',
    arrow: 'M4 12h15 M13 6l6 6-6 6',
    leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14z M5 19c3-4 6-7 10-9',
    drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    sun: 'M12 7.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9z M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M4.9 4.9l1.8 1.8 M17.3 17.3l1.8 1.8 M4.9 19.1l1.8-1.8 M17.3 6.7l1.8-1.8',
    cloud: 'M7 18h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.4 9.5 4.3 4.3 0 0 0 7 18z',
    bolt: 'M13 2L5 13h6l-1 9 8-11h-6z',
    gear: 'M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
    user: 'M12 4a4 4 0 1 1 0 8a4 4 0 0 1 0-8z M4.5 21c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5',
    heart: 'M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z',
    clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z M12 7v5.5l3.5 2',
    book: 'M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1z M12 6v14',
    wifi: 'M3 9.5a13 13 0 0 1 18 0 M6.3 13a8.3 8.3 0 0 1 11.4 0 M9.5 16.3a3.8 3.8 0 0 1 5 0 M12 19.5h.01',
    cpu: 'M7 7h10v10H7z M10 10h4v4h-4z M9.5 3v4 M14.5 3v4 M9.5 17v4 M14.5 17v4 M3 9.5h4 M3 14.5h4 M17 9.5h4 M17 14.5h4',
    shell: 'M12 20C6 20 3.5 15 4.5 10.5 6 5 12 4 12 4s6 1 7.5 6.5C20.5 15 18 20 12 20z M12 20V8 M8 19L9.5 9 M16 19l-1.5-10',
    mountain: 'M2.5 20l7-12 4 6.5 2.5-3.5 5.5 9z M8 12l1.5 1 1-1',
    wave: 'M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0 M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0',
    tree: 'M12 3l6 9h-3.5l4 5.5H5.5l4-5.5H6z M12 17.5V21',
    flag: 'M5 21V4 M5 4h12l-2.5 4L17 12H5',
    cart: 'M3 4h2.5l2.2 11h10.6l2-8H6.5 M9 19.5h.01 M17 19.5h.01',
    music: 'M9 18V5l11-2v13 M9 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0z M20 16a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0z',
    play: 'M7 4.5l12 7.5-12 7.5z',
    radio: 'M4 8h16v12H4z M7 8l9-4 M14.5 11.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5z M7 12h4 M7 15h4',
    tv: 'M3 6h18v12H3z M8 21h8 M9 3l3 3 3-3',
    laptop: 'M5 5h14v10H5z M2.5 18.5h19l-1.5-3.5H4z',
    satellite: 'M7 7l4 4 M5 9l4-4 4 4-4 4z M13 13l2 2 M14 8a5 5 0 0 1 2 2 M15 5a8 8 0 0 1 4 4',
    rocket: 'M12 3c3 2 4.5 5.5 4 10l-2.5 3h-3L8 13c-.5-4.5 1-8 4-10z M12 8.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3z M8.5 14l-3 3 .5 3 3-1.5 M15.5 14l3 3-.5 3-3-1.5',
    atom: 'M12 10.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3z M12 3c2.8 0 4 4 4 9s-1.2 9-4 9-4-4-4-9 1.2-9 4-9z M4.2 7.5c1.4-2.4 5.6-1.4 9.9 1.1s7.2 5.6 5.8 8.1-5.6 1.4-9.9-1.1-7.2-5.6-5.8-8.1z',
    hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.4 1.4 0 0 1 2.3-1.6L8 14',
    pencil: 'M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z M14 7l3 3',
    eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6z',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5'
  };

  window.PE_STYLES = S;
})();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** assets/ sits beside src/ and dist/, so this resolves in dev (tsx) and in the built server. */
export const ASSETS = path.resolve(here, '../assets');

/**
 * DAD Manufacturing brand (from dadmfg.com): navy #002E5D and magenta #ED1566 are the site's dominant colors,
 * with light blue #83B7E6 and grey #A0A0A0 as supporting colors. Fonts: Raleway (headings), Open Sans (body).
 * Override name/contact with env vars if they change.
 */
export const BRAND = {
  name: process.env.COMPANY_NAME ?? 'DAD Manufacturing, Inc.',
  tagline: 'Diversified · Accurate · Dependable',
  address: process.env.COMPANY_ADDRESS ?? '1400 Industrial Avenue, Hiawatha, Iowa 52233',
  phone: process.env.COMPANY_PHONE ?? '319-395-9427',
  web: process.env.COMPANY_WEB ?? 'www.dadmfg.com',
  // wording mirrors the website; it says "built to", not "certified to"
  qms: 'Quality management system built to ISO 9001:2015 standards',
  navy: '#002E5D', magenta: '#ED1566', sky: '#83B7E6', grey: '#A0A0A0',
  ink: '#16202a', mute: '#5b6b7a', line: '#c9d3dc',
  logo: path.join(ASSETS, 'dad-logo.png'),
};

const f = (n: string) => path.join(ASSETS, 'fonts', n);
export const FONT_FILES = {
  body: f('open-sans-latin-400-normal.woff'), semi: f('open-sans-latin-600-normal.woff'), bold: f('open-sans-latin-700-normal.woff'),
  head: f('raleway-latin-600-normal.woff'), headBold: f('raleway-latin-700-normal.woff'),
};
export const hasBrandAssets = () => [BRAND.logo, ...Object.values(FONT_FILES)].every(p => fs.existsSync(p));

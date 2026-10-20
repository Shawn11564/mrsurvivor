/* ============ fork/brand.cjs — MrSurvivor's branding, applied at build time ============
 * Upstream (JPTER78/pokesurvivor) files are never edited for branding: fork/build.cjs
 * rewrites their text on the way into the build, and rewrites the pages the build
 * writes. That keeps `git merge upstream/main` free of conflicts (see fork/README.md).
 *
 * Two kinds of rule:
 *   SPECIFIC  exact upstream snippets (credit lines, contact). The build fails if one
 *             stops matching, so an upstream change can't silently drop the credit.
 *   GENERIC   name + domain + contact email, everywhere.
 * Specific rules run first and write the upstream name as Pok&eacute;Survivor so the
 * generic rename leaves the credit alone. Every rule is idempotent.
 */
const BRAND = {
  name: 'MrSurvivor',
  domain: 'play.mrshawn.dev',
  // Leave empty to point "contact" at the site instead of a mailbox.
  contactEmail: '',
  site: 'https://mrshawn.dev',
  upstream: { name: 'PokéSurvivor', author: 'JPTER78', repo: 'https://github.com/JPTER78/pokesurvivor' }
};

const UPSTREAM_MAIL = 'jpieratorregrosa@gmail.com';
const contact = BRAND.contactEmail
  ? { text: BRAND.contactEmail, href: 'mailto:' + BRAND.contactEmail }
  : { text: BRAND.site.replace('https://', ''), href: BRAND.site };
const CREDIT_EN = `${BRAND.name} is a fan-made fork of Pok&eacute;Survivor by ${BRAND.upstream.author} ` +
  `(<a href="${BRAND.upstream.repo}" target="_blank" rel="noopener">github.com/JPTER78/pokesurvivor</a>), ` +
  'used under the PolyForm Noncommercial License 1.0.0. Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)';

// [file suffix, from, to]. `file` is matched against the path with forward slashes.
const SPECIFIC = [
  // About tab in Settings: credit under the logo.
  ['js/ui/settings-ui.js', '<div class="about-logo">PokéSurvivor</div>',
    `<div class="about-logo">${BRAND.name}</div><p class="sub center fork-credit">Fork of Pok&eacute;Survivor by ${BRAND.upstream.author}</p>`],
  // Legal screen: full credit + the license's Required Notice.
  // (Anchors include text the rename changes, so a second pass finds nothing.)
  ['.html', '<p><b>PokéSurvivor</b> es un juego hecho por fans',
    `<p class="fork-credit">${CREDIT_EN}</p>\n    <p><b>${BRAND.name}</b> es un juego hecho por fans`],
  // Footer line on the menu.
  ['.html', 'GAME FREAK · <a href="#" class="legal-link" data-legal>Aviso legal</a></div>',
    `GAME FREAK · <span class="fork-credit">Fork of Pok&eacute;Survivor by ${BRAND.upstream.author}</span> · <a href="#" class="legal-link" data-legal>Aviso legal</a></div>`],
  // Contact: the upstream author's mailbox must not receive this fork's mail.
  ['js/ui/ui.js', `'mailto:' + CONTACT + '?subject=Pok%C3%A9Survivor'`, JSON.stringify(contact.href).replace(/"/g, "'")],
  ['contacto/index.html', `mailto:${UPSTREAM_MAIL}?subject=Pok%C3%A9Survivor`, contact.href],
  // Donations go to upstream's Ko-fi / Sponsors: hide the button and the /apoyar/ links.
  ['js/data/funding.js', "kofi: 'jpter78'", "kofi: ''"],
  ['js/data/funding.js', "sponsors: 'JPTER78'", "sponsors: ''"],
];
// Which specific rules must fire during a build (key = index in SPECIFIC).
const REQUIRED_IN_BUILD = [0, 1, 2, 3, 5, 6];

const GENERIC = [
  [/PokéSurvivor/g, BRAND.name],
  [/pokesurvivor\.com/g, BRAND.domain],
  [new RegExp(UPSTREAM_MAIL.replace(/[.]/g, '\\.'), 'g'), contact.text],
];

const fired = new Set();
function brand(text, file) {
  const f = file.replace(/\\/g, '/');
  SPECIFIC.forEach(([suffix, from, to], i) => {
    if (f.endsWith(suffix) && text.includes(from)) { text = text.split(from).join(to); fired.add(i); }
  });
  for (const [rx, to] of GENERIC) text = text.replace(rx, to);
  return text;
}

module.exports = { BRAND, brand, fired, SPECIFIC, REQUIRED_IN_BUILD };

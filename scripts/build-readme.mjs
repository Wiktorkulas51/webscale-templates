#!/usr/bin/env node
// Generates README.md from templates/*/template.json. Edit the manifests, then run `npm run readme`.
// Usage: npm run readme

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const README_PATH = path.join(ROOT, 'README.md');

// Bundle data mirrors templateBundle in the WebScale site (src/data/templates.ts).
const BUNDLE = {
  priceUsd: 199,
  gumroadUrl: 'https://wiktorcraft172.gumroad.com/l/webscale-astro-templates-bundle',
  includes: [
    'Every current template with source code',
    'Every new template and update at no extra cost',
    'Help launching your first project',
    'White label licence: client launches under your brand',
  ],
};

const STACK_LABELS = { astro: 'Astro', tailwind: 'Tailwind CSS' };
const REQUIRED_KEYS = ['id', 'slug', 'name', 'tagline', 'description', 'stack', 'pricing', 'priceUsd', 'links', 'channels'];

async function loadTemplates() {
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const template = JSON.parse(await readFile(path.join(TEMPLATES_DIR, entry.name, 'template.json'), 'utf8'));
    validate(template, entry.name);
    templates.push(template);
  }
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

function validate(template, folder) {
  for (const key of REQUIRED_KEYS) {
    if (template[key] === undefined) throw new Error(`templates/${folder}/template.json is missing "${key}"`);
  }
  if (template.slug !== folder) throw new Error(`templates/${folder}: slug "${template.slug}" must match the folder name`);
  if (!['free', 'paid'].includes(template.pricing)) throw new Error(`templates/${folder}: pricing must be "free" or "paid"`);
  if (template.pricing === 'paid' && !template.links.gumroad) throw new Error(`templates/${folder}: paid template needs links.gumroad`);
}

function assetPath(template, file) {
  return `templates/${template.slug}/assets/${file}`;
}

function formatStack(stack) {
  return stack.map((key) => STACK_LABELS[key] ?? key).join(', ');
}

function formatLinks(template) {
  const links = [`[Live demo](${template.links.liveDemo})`];
  if (template.links.sourceRepo) links.push(`[Source code](${template.links.sourceRepo})`);
  if (template.pricing === 'paid') {
    links.push(`[Buy on Gumroad, $${template.priceUsd}](${template.links.gumroad})`);
  } else if (template.links.gumroad) {
    links.push(`[Free on Gumroad](${template.links.gumroad})`);
  }
  if (template.links.details) links.push(`[Template page](${template.links.details})`);
  return links.join(' · ');
}

function templateCard(template) {
  return [
    `### ${template.name}`,
    '',
    `[![${template.name} cover](${assetPath(template, 'cover-1280x720.webp')})](${template.links.liveDemo})`,
    '',
    `**${template.tagline}.** ${template.description}`,
    '',
    formatLinks(template),
    '',
    `Stack: ${formatStack(template.stack)}`,
    '',
  ].join('\n');
}

function buildReadme(templates) {
  const free = templates.filter((template) => template.pricing === 'free');
  const premium = templates.filter((template) => template.pricing === 'paid');
  const bundleIncludes = BUNDLE.includes.map((item) => `- ${item}`).join('\n');

  return [
    '# WebScale Templates',
    '',
    'A catalog of ready-made website templates built with Astro and Tailwind CSS. Every template has a live preview, a short description and links to where you can get it.',
    '',
    'Free templates link to their public source repositories. Premium templates are sold on Gumroad under their own licence; their source code is not published here.',
    '',
    '## Free templates',
    '',
    free.map(templateCard).join('\n'),
    '## Premium templates',
    '',
    premium.map(templateCard).join('\n'),
    '## Bundle',
    '',
    `**All templates, $${BUNDLE.priceUsd}.** Buy once and get every template in the catalog, including the ones added later.`,
    '',
    bundleIncludes,
    '',
    `[Buy the bundle on Gumroad, $${BUNDLE.priceUsd}](${BUNDLE.gumroadUrl})`,
    '',
    '## Custom website',
    '',
    'Need a website based on one of these templates, with your content, photos and domain? Ask for a quote at [webscale.pl/en/quote](https://webscale.pl/en/quote/).',
    '',
    '## License',
    '',
    '- The catalog code (scripts, README generator and docs) is released under the [MIT License](LICENSE).',
    '- Free templates are released under the MIT License.',
    '- Premium templates have their own licence, shown on their Gumroad product page. The MIT License of this repository does not cover them.',
    '',
    '## Development',
    '',
    '```bash',
    'npm install',
    'npm run assets            # regenerate preview images from the live demos',
    'npm run assets -- --only forma',
    'npm run readme            # regenerate this README from templates/*/template.json',
    '```',
    '',
  ].join('\n');
}

const templates = await loadTemplates();
await writeFile(README_PATH, buildReadme(templates), 'utf8');
console.log(`README.md written with ${templates.length} templates`);

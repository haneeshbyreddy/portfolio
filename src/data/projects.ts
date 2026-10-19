/**
 * The portfolio. Every entry here puts a person at a desk.
 * Add a project and the next desk in FILL_ORDER gets a new hire whose monitor
 * plays this project's preview. Order = seniority on the floor.
 *
 * All projects below are placeholders — swap in your own work.
 */

export type Discipline = 'landing' | 'saas' | 'film' | 'brand' | 'app';

export interface Project {
  id: string;
  title: string;
  client: string;
  year: number;
  discipline: Discipline;
  summary: string;
  role: string;
  stack: string[];
  /** The project's own palette — drives its screen and the panel accent. */
  palette: { bg: string; ink: string; accent: string; accent2: string };
  /** One short line shown on the screen hero / title card. */
  tagline: string;
  url?: string;
}

export const DEPARTMENTS: Record<Discipline, { name: string; short: string }> = {
  landing: { name: 'Landing Pages', short: 'Web' },
  saas: { name: 'SaaS Product', short: 'Product' },
  film: { name: 'Brand Film', short: 'Motion' },
  brand: { name: 'Brand Identity', short: 'Identity' },
  app: { name: 'Mobile Apps', short: 'App' },
};

export const projects: Project[] = [
  {
    id: 'orbit',
    title: 'Orbit',
    client: 'Orbit Money',
    year: 2026,
    discipline: 'landing',
    tagline: 'Money that moves at the speed of you.',
    summary:
      'A launch site for a cross-border payments startup. Scroll-driven storytelling, a live FX ticker and a card that follows the cursor through the page.',
    role: 'Art direction, design, front-end',
    stack: ['Figma', 'Astro', 'GSAP', 'WebGL'],
    palette: { bg: '#f2eee6', ink: '#141414', accent: '#ff5b1f', accent2: '#1f3cff' },
  },
  {
    id: 'halcyon',
    title: 'Halcyon',
    client: 'Halcyon Analytics',
    year: 2025,
    discipline: 'saas',
    tagline: 'Revenue intelligence for subscription teams.',
    summary:
      'A calm analytics workspace for finance teams drowning in dashboards. Designed the system, the charting language and the onboarding from zero to first insight.',
    role: 'Product design, design system',
    stack: ['Figma', 'React', 'D3', 'Storybook'],
    palette: { bg: '#0f1513', ink: '#e8eee9', accent: '#7cf0b2', accent2: '#f4c86a' },
  },
  {
    id: 'moss-ember',
    title: 'Moss & Ember',
    client: 'Moss & Ember Roasters',
    year: 2025,
    discipline: 'brand',
    tagline: 'Slow coffee from small farms.',
    summary:
      'Identity for a specialty roaster: a mark drawn from a roasting drum, an earthy palette and a packaging system that flexes across forty single origins.',
    role: 'Brand identity, packaging',
    stack: ['Illustrator', 'Glyphs', 'Blender'],
    palette: { bg: '#e9e1d2', ink: '#2b2722', accent: '#b4532d', accent2: '#4d5c3a' },
  },
  {
    id: 'northbound',
    title: 'Northbound',
    client: 'Northbound Outfitters',
    year: 2024,
    discipline: 'film',
    tagline: 'Find your north.',
    summary:
      'A ninety-second brand film for an outdoor label, made entirely in 3D. Layered ridgelines, long light and a type system that cuts on the beat.',
    role: 'Direction, 3D, motion design',
    stack: ['Blender', 'After Effects', 'Cinema 4D'],
    palette: { bg: '#0d0f12', ink: '#f1ede4', accent: '#d9a55b', accent2: '#6f8fa6' },
  },
  {
    id: 'parcel',
    title: 'Parcel',
    client: 'Parcel Inc.',
    year: 2024,
    discipline: 'app',
    tagline: 'Every delivery, beautifully on time.',
    summary:
      'A delivery-tracking app that turns anxious refreshing into a glanceable live map. Shipped to 1.2M users with a 4.8 rating.',
    role: 'Product design, prototyping',
    stack: ['Figma', 'SwiftUI', 'Rive'],
    palette: { bg: '#eef0f6', ink: '#111827', accent: '#4f46e5', accent2: '#22c55e' },
  },
  {
    id: 'kiln',
    title: 'Kiln',
    client: 'Kiln Ceramics Studio',
    year: 2023,
    discipline: 'landing',
    tagline: 'Made by hand. Fired with patience.',
    summary:
      'An editorial storefront for a ceramics studio — big photography, quiet type and a booking flow for wheel-throwing classes.',
    role: 'Design, Shopify development',
    stack: ['Figma', 'Shopify', 'Liquid'],
    palette: { bg: '#efe6db', ink: '#2a1f1a', accent: '#c4693a', accent2: '#7b8a6a' },
  },
  {
    id: 'atlas',
    title: 'Atlas',
    client: 'Atlas Cloud',
    year: 2023,
    discipline: 'saas',
    tagline: 'Infrastructure you can actually see.',
    summary:
      'A developer console that maps services, deploys and costs onto one living graph. Led the visual language and the command palette.',
    role: 'Product design, front-end',
    stack: ['Figma', 'Next.js', 'Canvas'],
    palette: { bg: '#0b0d17', ink: '#e6e8f2', accent: '#8b9bff', accent2: '#ff7ab6' },
  },
];

/**
 * The portfolio. Every entry here puts a person at a desk.
 * Add a project and it gets a new hire. The projects sit in a line along the
 * front row (`fillOrder` in `src/office/layout.ts`), in this order from left
 * to right.
 *
 * A project ships with one or more pieces of media, and each one lives on the
 * desk as the thing it plays on: a website and a film on the terminal, a
 * vertical reel on the worker's phone. The first piece is what the desk shows
 * when you arrive. Files live in `public/work/<project id>/`.
 */

interface MediaBase {
  /** Short name in the desk's media list: "Website", "Launch reel". */
  title: string;
  /** Full-quality file, played at the desk and in the case study. */
  src: string;
  /** A small, silent loop for the monitor while you're out on the floor. */
  floor?: string;
  /** First frame, shown while the video loads and as the thumbnail. */
  poster: string;
}

/** A screen recording of a live site, looped on the terminal. */
export interface SiteMedia extends MediaBase {
  kind: 'site';
  url: string;
}

/** A 16:9 film, played on the terminal like a tape. */
export interface FilmMedia extends MediaBase {
  kind: 'film';
  /** Seconds. */
  duration: number;
}

/** A 9:16 video, shown on the worker's phone. */
export interface ReelMedia extends MediaBase {
  kind: 'reel';
  duration: number;
}

export type Media = SiteMedia | FilmMedia | ReelMedia;

export type Device = 'terminal' | 'phone';

/** Where on the desk a piece of media plays. */
export const deviceFor = (m: Media): Device => (m.kind === 'reel' ? 'phone' : 'terminal');

export interface Project {
  id: string;
  title: string;
  client: string;
  year: number;
  /** What shipped, in a few words: "Website and launch reel". */
  kind: string;
  summary: string;
  role: string;
  stack: string[];
  /** The project's own palette — drives its title cards on the monitor while the footage loads. */
  palette: { bg: string; ink: string; accent: string; accent2: string };
  /** One short line under the title. */
  tagline: string;
  /** Three facts from the work itself, shown big in the case study. */
  facts: [string, string][];
  media: Media[];
}

const work = (id: string, file: string) => `/work/${id}/${file}`;

export const projects: Project[] = [
  {
    id: 'hyderabaddies',
    title: 'Hyderabaddies',
    client: 'Hyderabaddies',
    year: 2026,
    kind: 'Website and launch reel',
    tagline: 'Somebody is already going. Go with them.',
    summary:
      'An invite-only way to find company for plans already happening in Hyderabad. The brand is built from the city: a cat on the Charminar, paper kites, form stamps, and a reel cut like a group chat.',
    role: 'Brand, website, reel',
    stack: ['Next.js'],
    palette: { bg: '#c1271b', ink: '#fff3db', accent: '#fcc012', accent2: '#8d0116' },
    facts: [['1', 'City, by invitation'], ['0:40', 'Launch reel'], ['0', 'DMs before meeting']],
    media: [
      {
        kind: 'site',
        title: 'Website',
        url: 'https://hyderabaddies.in',
        src: work('hyderabaddies', 'site.mp4'),
        floor: work('hyderabaddies', 'site-floor.mp4'),
        poster: work('hyderabaddies', 'site.jpg'),
      },
      {
        kind: 'reel',
        title: 'Launch reel',
        duration: 40,
        src: work('hyderabaddies', 'reel.mp4'),
        floor: work('hyderabaddies', 'reel-floor.mp4'),
        poster: work('hyderabaddies', 'reel.jpg'),
      },
    ],
  },
  {
    id: 'hansanet',
    title: 'HansaNet',
    client: 'HansaNet',
    year: 2026,
    kind: 'SaaS, live and paid for',
    tagline: 'The big ISPs have a control room. Now you do.',
    summary:
      'A live SaaS for Indian ISPs with 500 to 20,000 homes, and eight of them pay for it every month. One box in the rack finds the cut, pages the crew on WhatsApp and tells the homes behind it. The site tells it as one street going dark.',
    role: 'Product, design, front-end',
    stack: ['HTML', 'CSS', 'JavaScript'],
    palette: { bg: '#000000', ink: '#e6e6e6', accent: '#5ac8bc', accent2: '#70b8ff' },
    facts: [['8', 'ISPs paying monthly'], ['₹20k', 'Monthly revenue'], ['₹3', 'A home, a month']],
    media: [
      {
        kind: 'site',
        title: 'Website',
        url: 'https://hansanet.in',
        src: work('hansanet', 'site.mp4'),
        floor: work('hansanet', 'site-floor.mp4'),
        poster: work('hansanet', 'site.jpg'),
      },
    ],
  },
  {
    id: 'ayuja',
    title: 'Ayuja',
    client: 'Ayuja Life Care',
    year: 2026,
    kind: 'Brand film',
    tagline: 'For every life inside your gate.',
    summary:
      'A film for Ayuja’s home services inside Muppa’s Melody, a gated community in Hyderabad. One day, from laundry at 7:30 to a balcony selfie at dusk, each service a small human moment.',
    role: 'Script, direction, edit',
    stack: ['Nano Banana', 'Kling', 'ElevenLabs', 'FFmpeg'],
    palette: { bg: '#f2eee5', ink: '#123c3e', accent: '#178a87', accent2: '#e4a14b' },
    facts: [['1:19', 'Runtime'], ['6', 'Services in one day'], ['1', 'Gated community']],
    media: [
      {
        kind: 'film',
        title: 'A day in the life',
        duration: 79,
        src: work('ayuja', 'film.mp4'),
        floor: work('ayuja', 'film-floor.mp4'),
        poster: work('ayuja', 'film.jpg'),
      },
    ],
  },
  {
    id: 'rbot',
    title: 'R-Bot',
    client: 'R-Bot',
    year: 2026,
    kind: 'Product website',
    tagline: 'Hire faster. With AI precision.',
    summary:
      'One place where a whole team finds, screens and hires together. The site follows one hire on a routing slip through seven desks, each adding to a single file that becomes the employee record.',
    role: 'Product, design, front-end',
    stack: ['Next.js', 'Vercel'],
    palette: { bg: '#e9e1c8', ink: '#26231e', accent: '#1f4ed8', accent2: '#e3ce9a' },
    facts: [['7', 'Roles, one file'], ['1', 'Proctored test'], ['0', 'Things typed twice']],
    media: [
      {
        kind: 'site',
        title: 'Website',
        url: 'https://resourcingbot.vercel.app',
        src: work('rbot', 'site.mp4'),
        floor: work('rbot', 'site-floor.mp4'),
        poster: work('rbot', 'site.jpg'),
      },
    ],
  },
  {
    id: 'faces',
    title: 'Printed Faces',
    client: 'Decision memo',
    year: 2026,
    kind: 'Interactive memo',
    tagline: 'Scanning faces with an iPhone and printing them as ₹2,500 gifts.',
    summary:
      'Should we start a 3D-printed portrait business? Six answers on one page, each with its evidence folded underneath, drawn to true scale, with twenty hard words defined on hover.',
    role: 'Research, writing, design',
    stack: ['HTML', 'SVG', 'Vercel'],
    palette: { bg: '#edece8', ink: '#16161a', accent: '#5b3fd1', accent2: '#c87c05' },
    facts: [['6', 'Answers, one page'], ['₹7,000', 'To test before ₹65,000'], ['30', 'Faces to pay back']],
    media: [
      {
        kind: 'site',
        title: 'Website',
        url: 'https://3dprinting-seven.vercel.app',
        src: work('faces', 'site.mp4'),
        floor: work('faces', 'site-floor.mp4'),
        poster: work('faces', 'site.jpg'),
      },
    ],
  },
];

/** The project's website, if it has one. */
export const siteOf = (p: Project) => p.media.find((m): m is SiteMedia => m.kind === 'site');

/** "hyderabaddies.in" from "https://hyderabaddies.in/". */
export const domainOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** "1:19" from 79. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

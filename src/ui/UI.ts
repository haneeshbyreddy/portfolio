import type { Experience } from '../core/Experience';
import type { Desk } from '../office/Office';
import { DEPARTMENTS, projects, type Project } from '../data/projects';
import { site } from '../config/site';
import { Ambience } from './Ambience';
import { arrowLeft, arrowRight, arrowUpRight, close, emblem, expand } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const pad = (n: number) => String(n).padStart(2, '0');

const letters = (word: string) =>
  [...word].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');

const spaced = (str: string) =>
  `<div class="spread">${[...str].map((c) => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div>`;

function statsFor(p: Project): [string, string][] {
  switch (p.discipline) {
    case 'landing': return [['+38%', 'Sign-ups'], ['0.9s', 'LCP'], ['6 wk', 'To launch']];
    case 'saas': return [['−42%', 'Time to insight'], ['120+', 'Components'], ['4.8', 'CSAT']];
    case 'brand': return [['40', 'SKUs'], ['3', 'Retail markets'], ['1', 'Mark, endless uses']];
    case 'film': return [['90s', 'Runtime'], ['2.4M', 'Views'], ['100%', 'CG']];
    case 'app': return [['1.2M', 'Users'], ['4.8★', 'App Store'], ['−31%', 'Support tickets']];
  }
}

export class UI {
  private root: HTMLElement;
  private label!: HTMLElement;
  private cursor!: HTMLElement;
  private panel!: HTMLElement;
  private caseEl!: HTMLElement;
  private dir!: HTMLElement;
  private hint!: HTMLElement;
  private hovered: Desk | null = null;
  private focused: Desk | null = null;
  private focusedProject: Project | null = null;
  private mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  private ring = { x: innerWidth / 2, y: innerHeight / 2 };
  private audio = new Ambience();
  private arriveTimer = 0;
  private caseOpen = false;
  private caseGen = 0;
  private fine = matchMedia('(pointer: fine)').matches;

  constructor(private exp: Experience, host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ui';
    host.appendChild(this.root);
    this.build();
    this.bind();
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------------------ */

  private build() {
    const total = this.exp.office.desks.length;
    const filled = this.exp.roster.length;
    const [w1, w2] = site.wordmark;
    const [first, ...rest] = site.name.split(' ');
    const touch = !this.fine;

    this.root.innerHTML = /* html */ `
      <div class="scrim"></div>

      <h1 class="wm wm--top" aria-label="${w1}${w2} — ${site.name}">
        <span class="wm__clip"><span class="wm__word">${letters(w1)}</span></span>
      </h1>
      <div class="wm wm--bottom" aria-hidden="true">
        <span class="wm__clip"><span class="wm__word">${letters(w2)}</span></span>
      </div>

      <div class="meta caps">
        <div class="justify reveal" style="--d:0"><span>Portfolio</span><span>Vol. ${new Date().getFullYear() - 2000}</span></div>
        <div class="reveal" style="--d:60">${spaced(`${site.since} - ?`)}</div>
        <div class="justify reveal" style="--d:120"><span>Desks</span><span>${pad(filled)} / ${pad(total)}</span></div>
        <div class="justify reveal" style="--d:180"><span>${first}</span><span>${rest.join(' ')}</span></div>
        <nav class="nav mono reveal" style="--d:260" aria-label="Primary">
          <button data-act="directory">Index</button>
          <button data-act="about">About</button>
          <a href="mailto:${site.email}" data-cursor="link">Contact</a>
          <button data-act="sound" aria-pressed="false" aria-label="Toggle sound"><span class="sound-bars"><i></i><i></i><i></i></span>Sound</button>
        </nav>
      </div>

      <footer class="credits caps">
        <div class="reveal" style="--d:300">${emblem()}</div>
        ${site.credits.map(([a, b], i) => `<div class="justify reveal" style="--d:${340 + i * 50}"><span>${a}</span><span>${b}</span></div>`).join('')}
      </footer>

      <div class="hint mono reveal" style="--d:900"><span class="hint__dot"></span>${touch ? 'Drag to look around · Tap a desk' : 'Drag to look around · Click a desk'}</div>

      <div class="label" aria-hidden="true"><div class="label__stem"></div><div class="label__inner"></div></div>

      <div class="topbar">
        <button class="chip mono" data-act="back" aria-label="Back to the floor">${arrowLeft}<span>Floor</span></button>
        <div class="crumbs mono"></div>
      </div>

      <section class="panel" aria-live="polite"></section>

      <section class="case" aria-hidden="true">
        <div class="case__stage"><div class="case__screen"></div></div>
        <div class="case__body"></div>
        <button class="chip mono case__close" data-act="case-close" aria-label="Close case study">${close}<span>Close</span></button>
      </section>

      <section class="directory" aria-hidden="true">
        <div>
          <h2>Index</h2>
          <div class="rows">
            ${this.exp.roster.map(({ project: p, desk }, i) => /* html */ `
              <button class="row" style="--i:${i}" data-project="${p.id}">
                <span class="mono">${pad(i + 1)}</span>
                <span class="row__title"><span class="swatch" style="--sw:${p.palette.accent}"></span>${p.title}</span>
                <span class="caps">${DEPARTMENTS[p.discipline].name}</span>
                <span class="mono">${p.year}</span>
                <span class="mono">Desk ${pad(desk.number)}</span>
              </button>`).join('')}
            <button class="row row--vacant" style="--i:${filled}" data-act="vacant">
              <span class="mono">—</span>
              <span class="row__title">${total - filled} desks unassigned</span>
              <span class="caps">Yours?</span>
              <span class="mono"></span>
              <span class="mono">Visit ↗</span>
            </button>
          </div>
        </div>
        <aside class="about" id="about">
          <div class="caps" style="color:var(--paper)">About</div>
          <p>${site.about}</p>
          <p>${site.discipline}. Independent since ${site.since}.</p>
          <div class="links">
            <a href="mailto:${site.email}" class="mono">${site.email}<span>↗</span></a>
            ${site.links.map((l) => `<a href="${l.href}" class="mono" target="_blank" rel="noopener">${l.label}<span>↗</span></a>`).join('')}
          </div>
        </aside>
        <button class="chip mono directory__close" data-act="directory-close" aria-label="Close index">${close}<span>Close</span></button>
      </section>

      <div class="loader">
        <div class="loader__center">${emblem()}<div class="mono" style="opacity:.8">A portfolio in an open field</div></div>
        <div class="loader__status mono">Preparing the floor</div>
        <div class="loader__pct mono">00%</div>
        <div class="loader__bar"><i></i></div>
      </div>

      <div class="cursor is-hidden" aria-hidden="true"><div class="cursor__ring"><span>View</span></div><div class="cursor__dot"></div></div>
    `;

    this.label = $(this.root, '.label');
    this.cursor = $(this.root, '.cursor');
    this.panel = $(this.root, '.panel');
    this.caseEl = $(this.root, '.case');
    this.dir = $(this.root, '.directory');
    this.hint = $(this.root, '.hint');
    if (this.fine) document.body.classList.add('has-cursor');
  }

  /* ------------------------------------------------------------------ */

  private load = { target: 0, shown: 0, last: performance.now(), reveal: false, done: false };

  setProgress(p: number) {
    this.load.target = Math.max(this.load.target, p);
  }

  /** The counter never outruns ~1.6s, so the one-sheet moment always lands. */
  private tickLoader() {
    const L = this.load;
    if (L.done) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - L.last) / 1000);
    L.last = now;
    L.shown = Math.min(L.target, L.shown + dt / 1.6);
    $(this.root, '.loader__bar').style.setProperty('--p', L.shown.toFixed(3));
    $(this.root, '.loader__pct').textContent = `${pad(Math.round(L.shown * 100))}%`;
    if (L.reveal && L.shown >= 1) {
      L.done = true;
      $(this.root, '.loader__status').textContent = 'Floor ready';
      setTimeout(() => {
        $(this.root, '.loader').classList.add('is-done');
        document.body.classList.add('is-ready');
        this.exp.playIntro();
      }, 420);
    }
  }

  reveal() {
    this.setProgress(1);
    this.load.reveal = true;
  }

  /** Dev helper: skip the loader immediately. */
  debugSkipLoader() {
    this.load.shown = 1;
    this.load.target = 1;
    this.load.reveal = true;
    this.tickLoader();
  }

  /* ------------------------------------------------------------------ */

  private bind() {
    const exp = this.exp;

    exp.on('hover', (desk, project) => {
      this.hovered = desk;
      const inner = $(this.label, '.label__inner');
      if (desk) {
        inner.innerHTML = project
          ? /* html */ `
            <div class="label__row mono"><span class="swatch" style="--sw:${project.palette.accent}"></span>Desk ${pad(desk.number)} · ${DEPARTMENTS[project.discipline].short}</div>
            <div class="label__title">${project.title}</div>`
          : /* html */ `
            <div class="label__row mono"><span class="swatch" style="--sw:#ffb347"></span>Desk ${pad(desk.number)} · Vacant</div>
            <div class="label__title">Unassigned</div>`;
        this.label.classList.add('is-on');
      } else {
        this.label.classList.remove('is-on');
      }
      this.cursor.classList.toggle('is-view', !!desk);
      $(this.cursor, '.cursor__ring span').textContent = desk ? (project ? 'View' : 'Sit') : '';
    });

    exp.on('focus', (desk, project) => {
      this.focused = desk;
      this.focusedProject = project;
      clearTimeout(this.arriveTimer);
      document.body.classList.remove('is-arrived');
      this.audio.setFocus(!!desk);
      if (desk) {
        this.hint.classList.add('is-gone');
        document.body.classList.add('is-focus');
        // let the old copy fade before swapping it
        this.arriveTimer = window.setTimeout(() => {
          this.renderPanel(desk, project);
          document.body.classList.add('is-arrived');
        }, document.body.classList.contains('is-focus-was') ? 450 : 750);
        document.body.classList.add('is-focus-was');
      } else {
        document.body.classList.remove('is-focus', 'is-focus-was');
        if (this.caseOpen) this.closeCase(true);
      }
    });

    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-project]');
      if (!t) return;
      const act = t.dataset.act;
      if (t.dataset.project) {
        const p = projects.find((x) => x.id === t.dataset.project);
        this.toggleDirectory(false);
        if (p) setTimeout(() => exp.focusProject(p), 250);
        return;
      }
      switch (act) {
        case 'back': exp.focus(null); break;
        case 'prev': exp.step(-1); break;
        case 'next': exp.step(1); break;
        case 'case': this.openCase(); break;
        case 'case-close': this.closeCase(); break;
        case 'directory': this.toggleDirectory(true); break;
        case 'about': this.toggleDirectory(true, true); break;
        case 'directory-close': this.toggleDirectory(false); break;
        case 'vacant': {
          this.toggleDirectory(false);
          const vacant = exp.office.desks.find((d) => !d.occupied && d.quadrant === 0) ?? exp.office.desks.find((d) => !d.occupied);
          if (vacant) setTimeout(() => exp.focus(vacant), 250);
          break;
        }
        case 'sound': {
          const on = this.audio.toggle();
          t.setAttribute('aria-pressed', String(on));
          break;
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.caseOpen) this.closeCase();
        else if (this.dir.classList.contains('is-open')) this.toggleDirectory(false);
        else if (this.focused) exp.focus(null);
      } else if (e.key === 'ArrowRight' && this.focused && !this.caseOpen) exp.step(1);
      else if (e.key === 'ArrowLeft' && this.focused && !this.caseOpen) exp.step(-1);
      else if (e.key === 'Enter' && this.focused && !this.focusedProject) location.href = `mailto:${site.email}`;
      else if ((e.key === 'i' || e.key === 'I') && !this.caseOpen) this.toggleDirectory(!this.dir.classList.contains('is-open'));
    });

    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.cursor.classList.remove('is-hidden');
      const overUI = (e.target as HTMLElement).closest('button, a');
      this.cursor.classList.toggle('is-link', !!overUI);
    });
    document.addEventListener('pointerleave', () => this.cursor.classList.add('is-hidden'));
  }

  /* ------------------------------------------------------------------ */

  private renderPanel(desk: Desk, p: Project | null) {
    const roster = this.exp.roster;
    const crumbs = $(this.root, '.crumbs');
    if (p) {
      const i = roster.findIndex((r) => r.project === p);
      const dept = DEPARTMENTS[p.discipline];
      crumbs.innerHTML = `Floor / <b>Desk ${pad(desk.number)}</b>`;
      this.panel.style.setProperty('--sw', p.palette.accent);
      this.panel.innerHTML = /* html */ `
        <div class="panel__top mono" style="--i:0"><span class="idx">${pad(i + 1)} / ${pad(roster.length)}</span><span class="swatch" style="--sw:${p.palette.accent}"></span><span>Dept. of ${dept.name}</span></div>
        <h2 class="panel__title" style="--i:1">${p.title}</h2>
        <p class="panel__tagline" style="--i:2">${p.tagline}</p>
        <p class="panel__summary" style="--i:3">${p.summary}</p>
        <dl class="panel__meta" style="--i:4">
          <div><dt class="mono">Client</dt><dd>${p.client}</dd></div>
          <div><dt class="mono">Year</dt><dd>${p.year}</dd></div>
          <div><dt class="mono">Role</dt><dd>${p.role}</dd></div>
          <div><dt class="mono">Stack</dt><dd>${p.stack.join(', ')}</dd></div>
        </dl>
        <div class="panel__actions" style="--i:5">
          <button class="btn btn--primary" data-act="case">Open case study ${expand}</button>
          ${p.url ? `<a class="btn btn--ghost" href="${p.url}" target="_blank" rel="noopener">Live site ${arrowUpRight}</a>` : ''}
        </div>
        <div class="pager" style="--i:6">
          <button data-act="prev" aria-label="Previous desk">${arrowLeft}</button>
          <div class="dots">${roster.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
          <button data-act="next" aria-label="Next desk">${arrowRight}</button>
          <span class="mono" style="margin-left:6px">← → to walk the floor</span>
        </div>`;
    } else {
      crumbs.innerHTML = `Floor / <b>Desk ${pad(desk.number)}</b>`;
      this.panel.innerHTML = /* html */ `
        <div class="panel__top mono" style="--i:0"><span class="idx">Desk ${pad(desk.number)}</span><span class="swatch" style="--sw:#ffb347"></span><span>Unassigned</span></div>
        <h2 class="panel__title" style="--i:1">Open desk.</h2>
        <p class="panel__tagline" style="--i:2">Reserved for the next project.</p>
        <p class="panel__summary" style="--i:3">Every desk on this floor is a piece of work. This one is still waiting — for a launch, a brand or a product that doesn’t exist yet.</p>
        <dl class="panel__meta" style="--i:4">
          <div><dt class="mono">Availability</dt><dd>Booking new work</dd></div>
          <div><dt class="mono">Reply</dt><dd>Within 48 hours</dd></div>
          <div><dt class="mono">Disciplines</dt><dd>Brand · Web · Product · Motion</dd></div>
          <div><dt class="mono">Based</dt><dd>Remote, worldwide</dd></div>
        </dl>
        <div class="panel__actions" style="--i:5">
          <a class="btn btn--primary" href="mailto:${site.email}">Start a project ${arrowUpRight}</a>
          <button class="btn btn--ghost" data-act="back">Back to floor <kbd>Esc</kbd></button>
        </div>`;
    }
  }

  /* ------------------------------------------------------------------ */

  private openCase() {
    const desk = this.focused;
    const p = this.focusedProject;
    if (!desk || !p || this.caseOpen) return;
    this.caseOpen = true;
    this.caseGen++;
    const body = $(this.caseEl, '.case__body');
    const dept = DEPARTMENTS[p.discipline];
    body.innerHTML = /* html */ `
      <div class="panel__top mono"><span class="swatch" style="--sw:${p.palette.accent}"></span><span>Dept. of ${dept.name} · ${p.year}</span></div>
      <h2 class="case__title">${p.title}</h2>
      <p class="panel__tagline">${p.tagline}</p>
      <p class="panel__summary">${p.summary}</p>
      <div class="case__stats">${statsFor(p).map(([n, l]) => `<div><b>${n}</b><span class="mono" style="color:var(--paper-dim)">${l}</span></div>`).join('')}</div>
      <dl class="panel__meta" style="border:0;padding:0">
        <div><dt class="mono">Client</dt><dd>${p.client}</dd></div>
        <div><dt class="mono">Role</dt><dd>${p.role}</dd></div>
      </dl>
      <div class="panel__actions">
        <a class="btn btn--primary" href="${p.url ?? '#'}" ${p.url ? 'target="_blank" rel="noopener"' : ''}>Visit project ${arrowUpRight}</a>
      </div>`;

    const screen = $(this.caseEl, '.case__screen');
    screen.style.cssText = '';
    screen.appendChild(this.exp.screens.hiCanvas);
    this.caseEl.setAttribute('aria-hidden', 'false');

    // FLIP: start exactly where the CRT face is on screen
    const from = this.exp.screenRect(desk);
    const to = $(this.caseEl, '.case__stage').getBoundingClientRect();
    screen.style.transition = 'none';
    screen.style.transform = `translate(${from.x - to.left}px, ${from.y - to.top}px) scale(${from.w / to.width}, ${from.h / to.height})`;
    screen.style.borderRadius = '4px';
    void screen.offsetWidth;
    requestAnimationFrame(() => {
      screen.style.transition = 'transform 1.05s var(--ease), border-radius 1.05s var(--ease)';
      screen.style.transform = 'none';
      screen.style.borderRadius = '';
      this.caseEl.classList.add('is-open');
    });
  }

  private closeCase(immediate = false) {
    if (!this.caseOpen) return;
    this.caseOpen = false;
    const gen = ++this.caseGen;
    const screen = $(this.caseEl, '.case__screen');
    this.caseEl.classList.remove('is-open');
    this.caseEl.setAttribute('aria-hidden', 'true');
    const desk = this.focused;
    if (desk && !immediate) {
      const from = this.exp.screenRect(desk);
      const to = $(this.caseEl, '.case__stage').getBoundingClientRect();
      screen.style.transform = `translate(${from.x - to.left}px, ${from.y - to.top}px) scale(${from.w / to.width}, ${from.h / to.height})`;
      screen.style.borderRadius = '4px';
      setTimeout(() => {
        if (gen !== this.caseGen) return;
        screen.style.transition = 'opacity .25s';
        screen.style.opacity = '0';
        setTimeout(() => {
          if (gen !== this.caseGen) return;
          screen.innerHTML = '';
          screen.style.cssText = '';
        }, 260);
      }, 980);
    } else {
      screen.innerHTML = '';
      screen.style.cssText = '';
    }
  }

  private toggleDirectory(open: boolean, about = false) {
    this.dir.classList.toggle('is-open', open);
    this.dir.setAttribute('aria-hidden', String(!open));
    if (open && about) setTimeout(() => $(this.dir, '#about').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  /* ------------------------------------------------------------------ */

  private frame = () => {
    this.tickLoader();
    // label follows its desk
    if (this.hovered) {
      const p = this.exp.project(this.hovered.labelAnchor);
      this.label.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }
    // cursor: dot is exact, ring trails
    this.ring.x += (this.mouse.x - this.ring.x) * 0.2;
    this.ring.y += (this.mouse.y - this.ring.y) * 0.2;
    this.cursor.style.transform = `translate3d(${this.ring.x}px, ${this.ring.y}px, 0)`;
    $(this.cursor, '.cursor__dot').style.transform = `translate(calc(-50% + ${this.mouse.x - this.ring.x}px), calc(-50% + ${this.mouse.y - this.ring.y}px))`;
    this.cursor.classList.toggle('is-drag', document.body.classList.contains('is-dragging'));
    requestAnimationFrame(this.frame);
  };
}

import type { Experience } from '../core/Experience';
import type { Desk } from '../office/Office';
import { DEPARTMENTS, projects, type Project } from '../data/projects';
import { site } from '../config/site';
import { Ambience } from './Ambience';
import { Pointer, Spring } from './Pointer';
import {
  arrowUpRight, chevronLeft, chevronRight, disciplineGlyph, emblem, expand, mark, move, reset, speaker, xmark,
} from './icons';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Small counts read better as words in a headline: "Seven at work." */
const words = (n: number) => {
  const w = n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '') : String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** A project's app icon: its own background, its accent, its department's glyph. */
const tile = (p: Project | null, size: 'sm' | 'md' | 'lg' = 'md') =>
  p
    ? `<span class="tile tile--${size}" style="--tile-bg:${p.palette.bg};--tile-fg:${p.palette.accent}">${disciplineGlyph[p.discipline]}</span>`
    : `<span class="tile tile--${size} tile--vacant">${disciplineGlyph.vacant}</span>`;

const info = (rows: [string, string][]) =>
  `<dl class="info">${rows.map(([k, v]) => `<div class="info__row"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function statsFor(p: Project): [string, string][] {
  switch (p.discipline) {
    case 'landing': return [['+38%', 'Sign-ups'], ['0.9s', 'Largest paint'], ['6 wk', 'To launch']];
    case 'saas': return [['−42%', 'Time to insight'], ['120+', 'Components'], ['4.8', 'Customer score']];
    case 'brand': return [['40', 'SKUs'], ['3', 'Retail markets'], ['1', 'Mark, endless uses']];
    case 'film': return [['90s', 'Runtime'], ['2.4M', 'Views'], ['100%', 'Computer generated']];
    case 'app': return [['1.2M', 'Users'], ['4.8', 'App Store rating'], ['−31%', 'Support tickets']];
  }
}

type DockState = 'hint' | 'reset' | 'none';

/** The lawn between two desks is crossed in less than this; the tag waits it out. */
const HOVER_GRACE = 240;
/** How long the tag takes to glide from one desk to the next. */
const GLIDE = 0.38;

export class UI {
  private root: HTMLElement;
  private tag!: HTMLElement;
  private sheet!: HTMLElement;
  private caseEl!: HTMLElement;
  private dir!: HTMLElement;
  private dock!: HTMLElement;
  private pointer: Pointer | null = null;
  /** The desk the tag is pinned to (it outlives the hover by HOVER_GRACE). */
  private tagDesk: Desk | null = null;
  private tagHide = 0;
  private tagWidth = 0;
  private tagX = new Spring(0);
  private tagY = new Spring(0);
  private tagGlide = Infinity;
  private focused: Desk | null = null;
  private focusedProject: Project | null = null;
  private audio = new Ambience();
  private arriveTimer = 0;
  private heightTimer = 0;
  private caseOpen = false;
  private caseGen = 0;
  private hintSpent = false;
  private dockState: DockState | null = null;
  private last = performance.now();
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
    const touch = !this.fine;

    this.root.innerHTML = /* html */ `
      <div class="scrim"></div>

      <header class="bar">
        <button class="brand" data-act="home" aria-label="${site.title}, back to the establishing shot">
          <span class="brand__icon">${mark}</span><span class="brand__name">${site.title}</span>
        </button>
        <nav class="toolbar glass" aria-label="Primary">
          <button class="toolbar__item" data-act="directory">Index</button>
          <button class="toolbar__item toolbar__item--about" data-act="about">About</button>
          <a class="toolbar__item" href="mailto:${site.email}">Contact</a>
          <span class="toolbar__sep" aria-hidden="true"></span>
          <button class="toolbar__item toolbar__item--icon" data-act="sound" aria-pressed="false" aria-label="Sound">${speaker}</button>
        </nav>
      </header>

      <section class="hero">
        <p class="hero__eyebrow r" style="--d:0">${site.name}</p>
        <h1 class="hero__title r" style="--d:70">${site.headline.replace(/ (\S+)$/, '&nbsp;$1')}</h1>
        <p class="hero__sub r" style="--d:140">${words(filled)} at work. ${words(total - filled)} waiting for&nbsp;yours.</p>
      </section>

      <div class="dock glass">
        <div class="dock__face dock__hint" aria-hidden="true">
          ${move}<span>Drag to explore</span><i></i><span>${touch ? 'Pinch to zoom' : 'Scroll to zoom'}</span><i></i><span>${touch ? 'Tap a desk' : 'Click a desk'}</span>
        </div>
        <button class="dock__face dock__reset" data-act="recentre" tabindex="-1">
          ${reset}<span>Reset view</span>${touch ? '' : '<kbd>esc</kbd>'}
        </button>
      </div>

      <div class="tag" aria-hidden="true"><div class="tag__card glass"></div></div>

      <section class="sheet" aria-live="polite">
        <div class="sheet__window glass glass--window">
          <div class="sheet__grabber" aria-hidden="true"></div>
          <div class="sheet__content"></div>
        </div>
        <nav class="ornament glass" aria-label="Walk the floor">
          <button class="ornament__btn" data-act="prev" aria-label="Previous desk">${chevronLeft}</button>
          <div class="dots" aria-hidden="true"></div>
          <span class="ornament__label">Open desks</span>
          <button class="ornament__btn" data-act="next" aria-label="Next desk">${chevronRight}</button>
        </nav>
      </section>

      <section class="case" aria-hidden="true">
        <div class="case__stage"><div class="case__screen"></div></div>
        <div class="case__body"></div>
        <button class="icon-btn glass case__close" data-act="case-close" aria-label="Close case study">${xmark}</button>
      </section>

      <section class="directory" aria-hidden="true">
        <div class="directory__window glass glass--window" role="dialog" aria-label="Index">
          <header class="directory__head">
            <h2 class="directory__title">Index</h2>
            <button class="icon-btn icon-btn--fill" data-act="directory-close" aria-label="Close index">${xmark}</button>
          </header>
          <div class="directory__body">
            <div class="directory__col">
              <p class="section-label">${words(filled)} projects</p>
              <div class="group">
                ${this.exp.roster.map(({ project: p, desk }, i) => /* html */ `
                  <button class="row" style="--i:${i}" data-project="${p.id}">
                    ${tile(p, 'md')}
                    <span class="row__text"><span class="row__title">${p.title}</span><span class="row__sub">${DEPARTMENTS[p.discipline].kind} · ${p.year}</span></span>
                    <span class="row__meta">Desk ${desk.number}</span>
                    <span class="row__chev">${chevronRight}</span>
                  </button>`).join('')}
              </div>
              <div class="group">
                <button class="row" style="--i:${filled}" data-act="vacant">
                  ${tile(null, 'md')}
                  <span class="row__text"><span class="row__title">${words(total - filled)} open desks</span><span class="row__sub">Your project could be next</span></span>
                  <span class="row__meta"></span>
                  <span class="row__chev">${chevronRight}</span>
                </button>
              </div>
            </div>
            <aside class="directory__col" id="about">
              <p class="section-label">About</p>
              <div class="group group--text">
                <p class="about__lead">${site.name}</p>
                <p>${site.about}</p>
                <p class="about__note">${site.discipline}. Independent since ${site.since}.</p>
              </div>
              <div class="group">
                <a class="row row--link" href="mailto:${site.email}"><span class="row__text"><span class="row__title">Email</span></span><span class="row__meta">${site.email}</span><span class="row__chev">${arrowUpRight}</span></a>
                ${site.links.map((l) => `<a class="row row--link" href="${l.href}" target="_blank" rel="noopener"><span class="row__text"><span class="row__title">${l.label}</span></span><span class="row__meta"></span><span class="row__chev">${arrowUpRight}</span></a>`).join('')}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div class="loader" role="status">
        <div class="loader__center">
          ${emblem('loader__emblem')}
          <div class="loader__bar" aria-hidden="true"><i></i></div>
          <span class="sr-only loader__status">Loading</span>
        </div>
      </div>
    `;

    this.tag = $(this.root, '.tag');
    this.sheet = $(this.root, '.sheet');
    this.caseEl = $(this.root, '.case');
    this.dir = $(this.root, '.directory');
    this.dock = $(this.root, '.dock');
    if (this.fine) {
      document.body.classList.add('has-pointer');
      this.pointer = new Pointer(this.root);
    }
  }

  /* ------------------------------------------------------------------ */

  private load = { target: 0, shown: 0, last: performance.now(), reveal: false, done: false };

  setProgress(p: number) {
    this.load.target = Math.max(this.load.target, p);
  }

  /** The bar never outruns ~1.6s, so the loading moment always lands. */
  private tickLoader() {
    const L = this.load;
    if (L.done) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - L.last) / 1000);
    L.last = now;
    L.shown = Math.min(L.target, L.shown + dt / 1.6);
    $(this.root, '.loader__bar').style.setProperty('--p', L.shown.toFixed(3));
    if (L.reveal && L.shown >= 1) {
      L.done = true;
      $(this.root, '.loader__status').textContent = 'Ready';
      setTimeout(() => {
        $(this.root, '.loader').classList.add('is-done');
        document.body.classList.add('is-ready');
        this.exp.playIntro();
      }, 380);
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
      clearTimeout(this.tagHide);
      if (desk) this.showTag(desk, project);
      // crossing the lawn between two desks shouldn't drop the tag or the lens
      else this.tagHide = window.setTimeout(() => this.hideTag(), HOVER_GRACE);
    });

    exp.on('frame', (dt) => this.placeTag(dt));

    exp.on('focus', (desk, project) => {
      this.focused = desk;
      this.focusedProject = project;
      clearTimeout(this.arriveTimer);
      document.body.classList.remove('is-arrived');
      this.audio.setFocus(!!desk);
      if (desk) {
        this.hintSpent = true;
        clearTimeout(this.tagHide);
        this.hideTag();
        const stepping = document.body.classList.contains('is-focus');
        document.body.classList.add('is-focus');
        // let the old copy fade before swapping it
        this.arriveTimer = window.setTimeout(() => {
          this.renderSheet(desk, project);
          document.body.classList.add('is-arrived', 'is-sheet');
        }, stepping ? 380 : 700);
      } else {
        document.body.classList.remove('is-focus', 'is-sheet');
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
        case 'home':
          if (this.focused) exp.focus(null);
          else exp.rig.home();
          break;
        case 'back': exp.focus(null); break;
        case 'recentre': exp.rig.home(); break;
        case 'prev': exp.step(-1); break;
        case 'next': exp.step(1); break;
        case 'case': this.openCase(); break;
        case 'case-close': this.closeCase(); break;
        case 'directory': this.toggleDirectory(true); break;
        case 'about': this.toggleDirectory(true, true); break;
        case 'directory-close': this.toggleDirectory(false); break;
        case 'vacant': {
          this.toggleDirectory(false);
          const vacant = exp.firstVacant();
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

    // a click on the dim area around the index closes it
    this.dir.addEventListener('click', (e) => {
      if (e.target === this.dir) this.toggleDirectory(false);
    });

    window.addEventListener('keydown', (e) => {
      const overlay = this.caseOpen || this.dir.classList.contains('is-open');
      if (e.key === 'Escape') {
        if (this.caseOpen) this.closeCase();
        else if (this.dir.classList.contains('is-open')) this.toggleDirectory(false);
        else if (this.focused) exp.focus(null);
        else exp.rig.home();
      } else if (e.key === '0' && !this.focused && !overlay) exp.rig.home();
      else if (e.key === 'ArrowRight' && this.focused && !this.caseOpen) exp.step(1);
      else if (e.key === 'ArrowLeft' && this.focused && !this.caseOpen) exp.step(-1);
      else if (e.key === 'Enter' && this.focused && !this.focusedProject && !overlay) location.href = `mailto:${site.email}`;
      else if ((e.key === 'i' || e.key === 'I') && !this.caseOpen) this.toggleDirectory(!this.dir.classList.contains('is-open'));
    });
  }

  /* ------------------------------------------------------------------ */

  private renderSheet(desk: Desk, p: Project | null) {
    const win = $(this.sheet, '.sheet__window');
    const shown = document.body.classList.contains('is-sheet');
    const from = win.getBoundingClientRect().height;
    this.fillSheet(desk, p);
    // between desks the window keeps its place and eases to its new height
    if (!shown) return;
    win.style.height = '';
    const to = win.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) return;
    win.style.height = `${from}px`;
    void win.offsetHeight;
    win.style.height = `${to}px`;
    clearTimeout(this.heightTimer);
    this.heightTimer = window.setTimeout(() => (win.style.height = ''), 600);
  }

  private fillSheet(desk: Desk, p: Project | null) {
    const roster = this.exp.roster;
    const content = $(this.sheet, '.sheet__content');
    const dots = $(this.sheet, '.dots');
    if (p) {
      const i = roster.findIndex((r) => r.project === p);
      const dept = DEPARTMENTS[p.discipline];
      content.innerHTML = /* html */ `
        <div class="sheet__bar" style="--i:0">
          <button class="icon-btn icon-btn--fill" data-act="back" aria-label="Back to the floor">${chevronLeft}</button>
          <span class="sheet__count">${i + 1} of ${roster.length}</span>
        </div>
        <div class="sheet__head" style="--i:1">
          ${tile(p, 'lg')}
          <div>
            <h2 class="sheet__title">${p.title}</h2>
            <p class="sheet__kicker">${dept.kind} · ${p.year}</p>
          </div>
        </div>
        <p class="sheet__tagline" style="--i:2">${p.tagline}</p>
        <p class="sheet__summary" style="--i:3">${p.summary}</p>
        <div class="sheet__actions" style="--i:4">
          <button class="btn btn--prominent" data-act="case" data-pointer="lift">${expand}<span>Open case study</span></button>
          ${p.url ? `<a class="btn btn--glass" href="${p.url}" target="_blank" rel="noopener"><span>Live site</span>${arrowUpRight}</a>` : ''}
        </div>
        <div class="sheet__info" style="--i:5">
          ${info([['Client', p.client], ['Role', p.role], ['Stack', p.stack.join(', ')], ['Desk', String(desk.number)]])}
        </div>`;
      dots.innerHTML = roster.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
      this.sheet.classList.remove('is-vacant');
    } else {
      content.innerHTML = /* html */ `
        <div class="sheet__bar" style="--i:0">
          <button class="icon-btn icon-btn--fill" data-act="back" aria-label="Back to the floor">${chevronLeft}</button>
          <span class="sheet__count">Desk ${desk.number}</span>
        </div>
        <div class="sheet__head" style="--i:1">
          ${tile(null, 'lg')}
          <div>
            <h2 class="sheet__title">Open desk</h2>
            <p class="sheet__kicker">Reserved for the next project</p>
          </div>
        </div>
        <p class="sheet__tagline" style="--i:2">This one is waiting for yours.</p>
        <p class="sheet__summary" style="--i:3">Every desk on this floor is a piece of work. This one is still empty — for a launch, a brand or a product that doesn’t exist yet.</p>
        <div class="sheet__actions" style="--i:4">
          <a class="btn btn--prominent" href="mailto:${site.email}" data-pointer="lift"><span>Start a project</span>${arrowUpRight}</a>
        </div>
        <div class="sheet__info" style="--i:5">
          ${info([['Availability', 'Booking new work'], ['Reply', 'Within 48 hours'], ['Disciplines', 'Brand, web, product, motion'], ['Based', 'Remote, worldwide']])}
        </div>`;
      this.sheet.classList.add('is-vacant');
    }
  }

  /* ------------------------------------------------------------------ */

  private openCase() {
    const desk = this.focused;
    const p = this.focusedProject;
    if (!desk || !p || this.caseOpen) return;
    this.caseOpen = true;
    this.exp.controls.enabled = false;
    this.caseGen++;
    const body = $(this.caseEl, '.case__body');
    const dept = DEPARTMENTS[p.discipline];
    body.innerHTML = /* html */ `
      <div class="case__head">${tile(p, 'md')}<p class="case__kicker">${dept.kind} · ${p.year}</p></div>
      <h2 class="case__title">${p.title}</h2>
      <p class="case__tagline">${p.tagline}</p>
      <p class="case__summary">${p.summary}</p>
      <div class="case__stats">${statsFor(p).map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      ${info([['Client', p.client], ['Role', p.role]])}
      <div class="case__actions">
        <a class="btn btn--prominent" href="${p.url ?? '#'}" ${p.url ? 'target="_blank" rel="noopener"' : ''} data-pointer="lift"><span>Visit project</span>${arrowUpRight}</a>
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
      screen.style.transition = 'transform 0.9s var(--spring-soft), border-radius 0.9s var(--ease-out)';
      screen.style.transform = 'none';
      screen.style.borderRadius = '';
      this.caseEl.classList.add('is-open');
    });
  }

  private closeCase(immediate = false) {
    if (!this.caseOpen) return;
    this.caseOpen = false;
    this.exp.controls.enabled = !this.dir.classList.contains('is-open');
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
      }, 860);
    } else {
      screen.innerHTML = '';
      screen.style.cssText = '';
    }
  }

  private toggleDirectory(open: boolean, about = false) {
    this.dir.classList.toggle('is-open', open);
    this.dir.setAttribute('aria-hidden', String(!open));
    this.exp.controls.enabled = !open && !this.caseOpen;
    if (open && about) setTimeout(() => $(this.dir, '#about').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  /* ------------------------------------------------------------------ */

  private showTag(desk: Desk, project: Project | null) {
    if (this.pointer) this.pointer.overDesk = true;
    if (desk === this.tagDesk) return;
    const card = $(this.tag, '.tag__card');
    const moving = !!this.tagDesk;
    this.tagDesk = desk;
    card.innerHTML = project
      ? /* html */ `
        ${tile(project, 'sm')}
        <span class="tag__text"><span class="tag__title">${project.title}</span><span class="tag__sub">${DEPARTMENTS[project.discipline].kind} · ${project.year}</span></span>`
      : /* html */ `
        ${tile(null, 'sm')}
        <span class="tag__text"><span class="tag__title">Desk ${desk.number}</span><span class="tag__sub">Open for your project</span></span>`;

    // measure the new content; when already showing, ease the width across
    card.style.width = '';
    const width = card.offsetWidth;
    if (moving && this.tagWidth && Math.abs(width - this.tagWidth) > 0.5) {
      card.style.width = `${this.tagWidth}px`;
      void card.offsetWidth;
      card.style.width = `${width}px`;
    }
    this.tagWidth = width;

    if (moving) {
      this.tagGlide = 0;
    } else {
      const p = this.exp.project(desk.labelAnchor);
      this.tagX.set(p.x);
      this.tagY.set(p.y);
      this.tagGlide = Infinity;
      this.placeTag(0);
    }
    this.tag.classList.add('is-on');
  }

  private hideTag() {
    if (this.pointer) this.pointer.overDesk = false;
    this.tagDesk = null;
    this.tag.classList.remove('is-on');
  }

  /** Pinned to its desk after the camera moves, so it never trails a frame behind. */
  private placeTag(dt: number) {
    const d = this.tagDesk;
    if (!d) return;
    const p = this.exp.project(d.labelAnchor);
    if (this.tagGlide < GLIDE) {
      // a critically damped glide to the next desk that stiffens until it holds
      this.tagGlide += dt;
      const k = 220 + (Math.min(1, this.tagGlide / GLIDE) ** 2) * 9000;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < steps; i++) {
        this.tagX.step(p.x, dt / steps, k, 1);
        this.tagY.step(p.y, dt / steps, k, 1);
      }
    } else {
      this.tagX.set(p.x);
      this.tagY.set(p.y);
    }
    this.tag.style.transform = `translate3d(${this.tagX.x.toFixed(2)}px, ${this.tagY.x.toFixed(2)}px, 0)`;
  }

  /** The dock is one capsule that changes its mind: a hint, then a way home. */
  private setDock(state: DockState) {
    if (state === this.dockState) return;
    const first = this.dockState === null;
    this.dockState = state;
    this.dock.dataset.state = state;
    const face = state === 'none' ? null : $(this.dock, state === 'hint' ? '.dock__hint' : '.dock__reset');
    if (face) {
      if (first) this.dock.style.transition = 'none';
      this.dock.style.width = `${face.scrollWidth}px`;
      if (first) {
        void this.dock.offsetWidth;
        this.dock.style.transition = '';
      }
    }
    $(this.dock, '.dock__reset').tabIndex = state === 'reset' ? 0 : -1;
  }

  private frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tickLoader();

    const away = this.exp.rig.mode === 'overview' && !this.exp.rig.isHome();
    document.body.classList.toggle('is-away', away);
    this.setDock(this.focused ? 'none' : away ? 'reset' : this.hintSpent ? 'none' : 'hint');

    this.pointer?.update(dt);
    requestAnimationFrame(this.frame);
  };
}

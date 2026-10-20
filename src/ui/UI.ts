import { Vector3 } from 'three';
import type { Experience } from '../core/Experience';
import type { Desk } from '../office/Office';
import { clock, deviceFor, domainOf, projects, siteOf, type Media, type Project } from '../data/projects';
import { site } from '../config/site';
import { Ambience } from './Ambience';
import { Opening } from './Opening';
import { Pointer, Spring } from './Pointer';
import { wordmark } from './brand';
import { arrowRight, arrowUpRight, chevronLeft, chevronRight, expand, mediaGlyph, move, pause, play, reset } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Small counts read better as words in a headline: "Seven at work." */
const words = (n: number) => {
  const w = n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '') : String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const lower = (n: number) => words(n).toLowerCase();
/** Numbers on files and desks: 01, 02… */
const pad = (n: number) => String(n).padStart(2, '0');

/** `*word*` → the word in the italic serif. */
const em = (text: string) => text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

const info = (rows: [string, string][]) =>
  `<dl class="info">${rows.map(([k, v]) => `<div class="info__row"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** A thumbnail drawn as the thing the media plays on: a browser, a letterboxed tube, a handset. */
const thumb = (m: Media) =>
  `<span class="thumb thumb--${m.kind}" aria-hidden="true"><span class="thumb__img" style="background-image:url('${m.poster}')"></span></span>`;

const mediaSub = (m: Media) =>
  m.kind === 'site' ? domainOf(m.url) : `${m.kind === 'film' ? 'Film' : 'Vertical reel'} · ${clock(m.duration)}`;

/** The sound control: a little meter that only moves when it's on. */
const meter = '<span class="meter" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

/** Width ÷ height of each medium's frame in the case study (the site's includes its browser bar). */
const CHROME = 34;
const ASPECT: Record<Media['kind'], number> = { site: 1280 / 906, film: 16 / 9, reel: 9 / 16 };

type DockState = 'hint' | 'reset' | 'none';

/** The lawn between two desks is crossed in less than this; the tag waits it out. */
const HOVER_GRACE = 240;
/** How long the tag takes to glide from one desk to the next. */
const GLIDE = 0.38;
/** Desk-top height: where the tag's stake goes in. */
const STAKE_Y = 0.76;

export class UI {
  private root: HTMLElement;
  private tag!: HTMLElement;
  private sheet!: HTMLElement;
  private caseEl!: HTMLElement;
  private dir!: HTMLElement;
  private dock!: HTMLElement;
  private opening!: Opening;
  private pointer: Pointer | null = null;
  /** The desk the tag is pinned to (it outlives the hover by HOVER_GRACE). */
  private tagDesk: Desk | null = null;
  private tagHide = 0;
  private tagWidth = 0;
  private tagX = new Spring(0);
  private tagY = new Spring(0);
  private tagGlide = Infinity;
  private stake = new Vector3();
  private focused: Desk | null = null;
  private focusedProject: Project | null = null;
  private audio = new Ambience();
  private arriveTimer = 0;
  private heightTimer = 0;
  private caseOpen = false;
  private caseGen = 0;
  /** The media mounted in the case study's frame. */
  private caseMedia: Media | null = null;
  private seeking = false;
  private hintSpent = false;
  private dockState: DockState | null = null;
  private last = performance.now();
  private fine = matchMedia('(pointer: fine)').matches;

  constructor(private exp: Experience, host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ui';
    host.appendChild(this.root);
    grain();
    this.build();
    this.bind();
    this.opening = new Opening($(this.root, '.opening'), exp, () => {
      document.body.classList.add('is-ready');
      exp.playIntro();
      // the hint waits until the crane has put you down on the floor
      setTimeout(() => document.body.classList.add('is-settled'), 3400);
    });
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------------------ */

  private build() {
    const total = this.exp.office.desks.length;
    const filled = this.exp.roster.length;
    const open = total - filled;
    const touch = !this.fine;

    this.root.innerHTML = /* html */ `
      <div class="scrim"></div>

      <header class="bar">
        <button class="brand" data-act="home" aria-label="${site.title}, back to the establishing shot">${wordmark('brand__mark')}</button>
        <nav class="nav" aria-label="Primary">
          <button class="nav__item" data-act="directory">Index<sup>${pad(filled)}</sup></button>
          <button class="nav__item nav__item--about" data-act="about">About</button>
          <a class="nav__item" href="mailto:${site.email}">Contact</a>
          <button class="nav__item nav__sound" data-act="sound" aria-pressed="false" aria-label="Sound">${meter}<span class="nav__sound-label">Sound</span></button>
        </nav>
      </header>

      <section class="hero">
        <p class="label hero__kicker r" style="--d:0">A portfolio by ${site.name}</p>
        <h1 class="hero__title r" style="--d:90">${em(site.headline)}</h1>
        <p class="hero__sub r" style="--d:200">${em(`${words(filled)} at work. ${words(open)} waiting for *yours*.`)}</p>
      </section>

      <div class="dock">
        <div class="dock__face dock__hint" aria-hidden="true">
          ${move}<span>Drag to explore</span><i></i><span>${touch ? 'Pinch to zoom' : 'Scroll to zoom'}</span><i></i><span>${touch ? 'Tap a desk' : 'Click a desk'}</span>
        </div>
        <button class="dock__face dock__reset" data-act="recentre" tabindex="-1">
          ${reset}<span>Reset view</span>${touch ? '' : '<kbd>esc</kbd>'}
        </button>
      </div>

      <div class="tag" aria-hidden="true"><div class="tag__card"></div><i class="tag__leader"></i><i class="tag__pin"></i></div>

      <section class="sheet" aria-live="polite">
        <div class="sheet__window paper" data-surface="paper">
          <div class="sheet__grabber" aria-hidden="true"></div>
          <header class="sheet__bar">
            <button class="sheet__back" data-act="back" aria-label="Back to the floor">${chevronLeft}<span>Floor</span></button>
            <nav class="sheet__step" aria-label="Walk the floor">
              <button class="sheet__stepbtn" data-act="prev" aria-label="Previous desk">${chevronLeft}</button>
              <span class="sheet__count"></span>
              <button class="sheet__stepbtn" data-act="next" aria-label="Next desk">${chevronRight}</button>
            </nav>
          </header>
          <div class="sheet__content"></div>
        </div>
      </section>

      <section class="case" aria-hidden="true">
        <div class="case__stage">
          <div class="case__frame">
            <div class="case__chrome" aria-hidden="true"><span class="case__lights"><i></i><i></i><i></i></span><span class="case__url"></span></div>
            <div class="case__media"></div>
          </div>
          <div class="case__bar">
            <div class="case__seg" role="tablist" aria-label="On this desk"></div>
            <div class="case__transport">
              <button class="case__btn case__play" data-act="case-play" aria-label="Pause">${pause}${play}</button>
              <div class="case__track" role="slider" aria-label="Seek" tabindex="0"><i></i></div>
              <span class="case__time">0:00</span>
              <button class="case__btn case__mute" data-act="case-mute" aria-pressed="true" aria-label="Sound">${meter}</button>
            </div>
          </div>
        </div>
        <div class="case__body"></div>
        <button class="case__close" data-act="case-close" aria-label="Close case study">Close<kbd>esc</kbd></button>
      </section>

      <section class="directory paper" data-surface="paper" aria-hidden="true" role="dialog" aria-label="Index">
        <div class="directory__page">
          <header class="directory__head">
            <span class="directory__mark">${wordmark()}</span>
            <button class="directory__close" data-act="directory-close" aria-label="Close index">Close<kbd>esc</kbd></button>
          </header>
          <h2 class="directory__title">${em(`${words(filled)} projects on the *floor*.`)}</h2>
          <ol class="directory__list">
            ${this.exp.roster.map(({ project: p, desk }, i) => /* html */ `
              <li style="--i:${i}">
                <button class="entry" data-project="${p.id}" data-pointer="none">
                  <span class="entry__num">${pad(i + 1)}</span>
                  <span class="entry__title">${p.title}</span>
                  <span class="entry__kind">${p.kind}</span>
                  <span class="entry__meta">Desk ${pad(desk.number)}<br>${p.year}</span>
                  <span class="entry__go">${arrowRight}</span>
                  <span class="entry__peek" aria-hidden="true" style="background-image:url('${p.media[0].poster}')"></span>
                </button>
              </li>`).join('')}
            <li style="--i:${filled}">
              <button class="entry entry--open" data-act="vacant" data-pointer="none">
                <span class="entry__num">+</span>
                <span class="entry__title">${words(open)} open desks</span>
                <span class="entry__kind">Your project could be next</span>
                <span class="entry__meta">${open} desks<br>unassigned</span>
                <span class="entry__go">${arrowRight}</span>
              </button>
            </li>
          </ol>
          <footer class="directory__about" id="about">
            <p class="label">About</p>
            <div class="about">
              <p class="about__lead">${em(site.about)}</p>
              <div class="about__side">
                <p class="about__more">${site.aboutMore}</p>
                <ul class="about__links">
                  <li><a href="mailto:${site.email}"><span>Email</span><span class="about__meta">${site.email}</span>${arrowUpRight}</a></li>
                  ${site.links.map((l) => `<li><a href="${l.href}" target="_blank" rel="noopener"><span>${l.label}</span><span class="about__meta"></span>${arrowUpRight}</a></li>`).join('')}
                </ul>
                <p class="label label--quiet">${site.name} — ${site.discipline} — Independent since ${site.since}</p>
              </div>
            </div>
          </footer>
        </div>
      </section>

      <div class="opening" role="status">
        <div class="opening__ground"></div>
        <div class="opening__frame">
          <p class="opening__beat">${em(`${words(total)} desks in an open *field*.`)}</p>
          <p class="opening__beat">${em(`${words(filled)} of them are at *work*.`)}</p>
          <p class="opening__beat">${em(`The other ${lower(open)} wait under *sheets*.`)}</p>
          <div class="opening__card">
            <span class="opening__credit">A portfolio by</span>
            ${wordmark('opening__mark')}
            <span class="opening__credit">${site.name}</span>
          </div>
          <i class="opening__rule" aria-hidden="true"></i>
        </div>
        <div class="opening__foot">
          <button class="opening__sound" data-act="sound" aria-pressed="false">${meter}<span>Sound</span></button>
          <span class="opening__hint" aria-hidden="true">${touch ? 'Tap' : 'Click'} to skip</span>
        </div>
        <span class="sr-only opening__status">Loading</span>
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

  setProgress(p: number) {
    this.opening.progress(p);
  }

  reveal() {
    this.opening.ready();
  }

  /** Dev helper: skip the opening and its fog. */
  debugSkipLoader() {
    this.opening.debugSkip();
    this.exp.liftVeil(0.01);
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

    // the pointer becomes a lens over the phone or terminal you could switch to
    exp.on('aim', (device) => {
      if (this.pointer && !this.tagDesk) this.pointer.overDesk = !!device;
    });

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

    exp.on('media', (_desk, project, index) => {
      this.markMedia(index);
      if (this.caseOpen && project === this.focusedProject) this.showCaseMedia(project.media[index]);
    });

    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-project], [data-media]');
      if (!t) return;
      const act = t.dataset.act;
      if (t.dataset.project) {
        const p = projects.find((x) => x.id === t.dataset.project);
        this.toggleDirectory(false);
        if (p) setTimeout(() => exp.focusProject(p), 250);
        return;
      }
      if (t.dataset.media) {
        exp.selectMedia(Number(t.dataset.media));
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
        case 'case-play': this.togglePlay(); break;
        case 'case-mute': {
          const m = this.caseMedia;
          if (m) exp.library.force(m, !this.caseLoud);
          break;
        }
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
          exp.library.setSound(on);
          this.root.querySelectorAll('[data-act="sound"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
          break;
        }
      }
    });

    // scrubbing the case study's film or reel
    const track = $(this.caseEl, '.case__track');
    const seek = (e: PointerEvent) => {
      const v = this.caseMedia && this.exp.library.element(this.caseMedia);
      if (!v || !v.duration) return;
      const r = track.getBoundingClientRect();
      v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * v.duration;
    };
    track.addEventListener('pointerdown', (e) => {
      this.seeking = true;
      track.setPointerCapture(e.pointerId);
      seek(e);
    });
    track.addEventListener('pointermove', (e) => this.seeking && seek(e));
    track.addEventListener('pointerup', () => (this.seeking = false));
    track.addEventListener('pointercancel', () => (this.seeking = false));

    window.addEventListener('resize', () => this.caseOpen && this.caseMedia && this.fitFrame(this.caseMedia, false));

    window.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('is-ready')) return;
      const overlay = this.caseOpen || this.dir.classList.contains('is-open');
      const timed = this.caseOpen && this.caseMedia && this.caseMedia.kind !== 'site';
      if (e.key === 'Escape') {
        if (this.caseOpen) this.closeCase();
        else if (this.dir.classList.contains('is-open')) this.toggleDirectory(false);
        else if (this.focused) exp.focus(null);
        else exp.rig.home();
      } else if (e.key === '0' && !this.focused && !overlay) exp.rig.home();
      else if (/^[1-9]$/.test(e.key) && this.focusedProject && !this.dir.classList.contains('is-open')) exp.selectMedia(Number(e.key) - 1);
      else if (e.key === ' ' && timed) {
        e.preventDefault();
        this.togglePlay();
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && timed) {
        const v = exp.library.element(this.caseMedia!);
        if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (e.key === 'ArrowRight' ? 5 : -5)));
      } else if (e.key === 'ArrowRight' && this.focused && !this.caseOpen) exp.step(1);
      else if (e.key === 'ArrowLeft' && this.focused && !this.caseOpen) exp.step(-1);
      else if (e.key === 'Enter' && this.focused && !this.focusedProject && !overlay) location.href = `mailto:${site.email}`;
      else if ((e.key === 'i' || e.key === 'I') && !this.caseOpen) this.toggleDirectory(!this.dir.classList.contains('is-open'));
    });
  }

  /* ------------------------------------------------------------------ */
  /* The desk's file card                                                */
  /* ------------------------------------------------------------------ */

  private renderSheet(desk: Desk, p: Project | null) {
    const win = $(this.sheet, '.sheet__window');
    const shown = document.body.classList.contains('is-sheet');
    const from = win.getBoundingClientRect().height;
    this.fillSheet(desk, p);
    // between desks the card keeps its place and eases to its new height
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

  /** What's on the desk: one row per piece of media, the one on show marked. */
  private mediaList(p: Project) {
    const sound = this.exp.library.hasSound;
    return /* html */ `
      <div class="media" style="--i:5">
        <p class="label">On this desk</p>
        <div class="media__list">
          ${p.media.map((m, i) => /* html */ `
            <div class="media__item" data-index="${i}">
              <button class="media__pick" data-media="${i}" aria-pressed="false">
                ${thumb(m)}
                <span class="media__text">
                  <span class="media__title">${m.title}</span>
                  <span class="media__sub">${mediaGlyph[m.kind]}${mediaSub(m)}</span>
                </span>
                <span class="media__key" aria-hidden="true">${p.media.length > 1 ? i + 1 : ''}</span>
              </button>
              ${m.kind === 'site' ? '' : `<button class="media__sound" data-act="sound" aria-pressed="${sound}" aria-label="Sound">${meter}</button>`}
            </div>`).join('')}
        </div>
      </div>`;
  }

  /** Mark which piece of media is on show, in the card and the case study's switcher. */
  private markMedia(index: number) {
    this.sheet.querySelectorAll<HTMLElement>('.media__item').forEach((el) => {
      const on = Number(el.dataset.index) === index;
      el.classList.toggle('is-on', on);
      el.querySelector('.media__pick')?.setAttribute('aria-pressed', String(on));
    });
    const seg = $(this.caseEl, '.case__seg');
    seg.querySelectorAll<HTMLElement>('[data-media]').forEach((el) => {
      el.setAttribute('aria-selected', String(Number(el.dataset.media) === index));
    });
    this.placeSegPill();
  }

  private fillSheet(desk: Desk, p: Project | null) {
    const roster = this.exp.roster;
    const content = $(this.sheet, '.sheet__content');
    const count = $(this.sheet, '.sheet__count');
    if (p) {
      const i = roster.findIndex((r) => r.project === p);
      const live = siteOf(p);
      count.innerHTML = `<b>${pad(i + 1)}</b> / ${pad(roster.length)}`;
      content.innerHTML = /* html */ `
        <p class="label sheet__file" style="--i:0">Desk ${pad(desk.number)} <span>—</span> ${p.client}</p>
        <h2 class="sheet__title" style="--i:1">${p.title}</h2>
        <p class="label sheet__kind" style="--i:2">${p.kind} <span>—</span> ${p.year}</p>
        <p class="sheet__tagline" style="--i:3">${p.tagline}</p>
        <p class="sheet__summary" style="--i:4">${p.summary}</p>
        ${this.mediaList(p)}
        <div class="sheet__actions" style="--i:6">
          <button class="btn btn--ink" data-act="case" data-pointer="lift">${expand}<span>Open case study</span></button>
          ${live ? `<a class="btn btn--line" href="${live.url}" target="_blank" rel="noopener"><span>Live site</span>${arrowUpRight}</a>` : ''}
        </div>
        <div class="sheet__info" style="--i:7">
          ${info([['Role', p.role], ['Stack', p.stack.join(', ')]])}
        </div>`;
      this.sheet.classList.remove('is-vacant');
      this.markMedia(this.exp.selected);
    } else {
      count.innerHTML = `<b>Open</b>`;
      content.innerHTML = /* html */ `
        <p class="label sheet__file" style="--i:0">Desk ${pad(desk.number)} <span>—</span> Unassigned</p>
        <h2 class="sheet__title" style="--i:1">Open desk</h2>
        <p class="label sheet__kind" style="--i:2">Reserved for the next project</p>
        <p class="sheet__tagline" style="--i:3">This one is waiting for yours.</p>
        <p class="sheet__summary" style="--i:4">Every desk on this floor is a piece of work. This one is still under its sheet — for a launch, a brand or a product that doesn’t exist yet.</p>
        <div class="sheet__actions" style="--i:5">
          <a class="btn btn--ink" href="mailto:${site.email}" data-pointer="lift"><span>Start a project</span>${arrowUpRight}</a>
        </div>
        <div class="sheet__info" style="--i:6">
          ${info([['Availability', 'Booking new work'], ['Reply', 'Within 48 hours'], ['Disciplines', 'Brand, web, product, film'], ['Based', 'Remote, worldwide']])}
        </div>`;
      this.sheet.classList.add('is-vacant');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Case study: the screening room                                      */
  /* ------------------------------------------------------------------ */

  private get caseLoud() {
    return $(this.caseEl, '.case__mute').getAttribute('aria-pressed') === 'true';
  }

  private openCase() {
    const desk = this.focused;
    const p = this.focusedProject;
    if (!desk || !p || this.caseOpen) return;
    this.caseOpen = true;
    document.body.classList.add('is-case');
    this.exp.controls.enabled = false;
    const gen = ++this.caseGen;
    const live = siteOf(p);
    const i = this.exp.roster.findIndex((r) => r.project === p);
    $(this.caseEl, '.case__body').innerHTML = /* html */ `
      <p class="label case__kicker">Case ${pad(i + 1)} <span>/</span> ${pad(this.exp.roster.length)} <span>—</span> ${p.kind} <span>—</span> ${p.year}</p>
      <h2 class="case__title">${p.title}</h2>
      <p class="case__tagline">${p.tagline}</p>
      <p class="case__summary">${p.summary}</p>
      <div class="case__stats">${p.facts.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      ${info([['Client', p.client], ['Role', p.role], ['Stack', p.stack.join(', ')]])}
      ${live ? `<div class="case__actions"><a class="btn btn--bone" href="${live.url}" target="_blank" rel="noopener" data-pointer="lift"><span>Visit ${domainOf(live.url)}</span>${arrowUpRight}</a></div>` : ''}`;

    // the switcher: one tab per piece of media, a rule that slides between them
    const seg = $(this.caseEl, '.case__seg');
    seg.innerHTML = p.media.length > 1
      ? `<i class="case__pill" aria-hidden="true"></i>${p.media.map((m, k) => `<button class="case__segbtn" role="tab" data-media="${k}" aria-selected="false"><span class="case__segnum">${pad(k + 1)}</span><span>${m.title}</span></button>`).join('')}`
      : '';
    this.caseEl.classList.toggle('has-seg', p.media.length > 1);

    const m = p.media[this.exp.selected];
    this.caseEl.setAttribute('aria-hidden', 'false');
    this.mount(m);
    const to = this.fitFrame(m, false);
    this.markMedia(this.exp.selected);

    // FLIP: the frame starts exactly where the screen is in the scene
    const frame = $(this.caseEl, '.case__frame');
    const from = this.exp.screenRect(desk, deviceFor(m));
    frame.style.transition = 'none';
    frame.style.transform = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})`;
    frame.classList.add('is-flying');
    void frame.offsetWidth;
    requestAnimationFrame(() => {
      if (gen !== this.caseGen) return;
      frame.style.transition = '';
      frame.style.transform = '';
      frame.classList.remove('is-flying');
      this.caseEl.classList.add('is-open');
    });
  }

  /** Lend the media's video to the frame; films and reels come up loud. */
  private mount(m: Media) {
    const lib = this.exp.library;
    const prev = this.caseMedia;
    this.caseMedia = m;
    const v = lib.play(m, true);
    if (prev && prev !== m) lib.home(prev);
    $(this.caseEl, '.case__media').replaceChildren(v);
    lib.clearForced();
    if (m.kind !== 'site') lib.force(m, true);
    this.caseEl.dataset.kind = m.kind;
    if (m.kind === 'site') $(this.caseEl, '.case__url').textContent = domainOf(m.url);
  }

  /**
   * Size the frame to the medium's shape inside the stage, with the control
   * bar hung just under it and the pair centred. Returns the frame's viewport rect.
   */
  private fitFrame(m: Media, animate: boolean) {
    const stage = $(this.caseEl, '.case__stage');
    const frame = $(this.caseEl, '.case__frame');
    const bar = $(this.caseEl, '.case__bar');
    const sr = stage.getBoundingClientRect();
    const barH = bar.offsetHeight;
    const gap = barH ? 16 : 0;
    const availW = sr.width;
    const availH = sr.height - barH - gap;
    const chrome = m.kind === 'site' ? CHROME : 0;
    // the reel sits in a handset like the one on the desk
    const bezel = m.kind === 'reel' ? 20 : 0;
    const ar = ASPECT[m.kind];
    const inner = Math.min(availW - bezel, (availH - chrome - bezel) * ar);
    const w = Math.round(inner + bezel);
    const h = Math.round(inner / ar + chrome + bezel);
    const top = Math.max(0, (sr.height - (h + gap + barH)) / 2);
    const left = (availW - w) / 2;
    for (const el of [frame, bar]) if (!animate) el.style.transition = 'none';
    Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px` });
    bar.style.top = `${top + h + gap}px`;
    bar.style.width = `${Math.max(w, 280)}px`;
    if (!animate) {
      void frame.offsetWidth;
      frame.style.transition = '';
      bar.style.transition = '';
    }
    return { x: sr.left + left, y: sr.top + top, w, h };
  }

  /** Switching media inside the case study: fade out, reshape, fade in. */
  private showCaseMedia(m: Media) {
    if (m === this.caseMedia) return;
    const gen = this.caseGen;
    const frame = $(this.caseEl, '.case__frame');
    frame.classList.add('is-swapping');
    setTimeout(() => {
      if (gen !== this.caseGen || !this.caseOpen) return;
      this.mount(m);
      this.fitFrame(m, true);
      requestAnimationFrame(() => frame.classList.remove('is-swapping'));
    }, 200);
  }

  private togglePlay() {
    const v = this.caseMedia && this.exp.library.element(this.caseMedia);
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }

  private placeSegPill() {
    const seg = $(this.caseEl, '.case__seg');
    const on = seg.querySelector<HTMLElement>('[aria-selected="true"]');
    const pill = seg.querySelector<HTMLElement>('.case__pill');
    if (!on || !pill) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  /** Transport readouts follow the video every frame. */
  private tickCase() {
    const m = this.caseMedia;
    if (!this.caseOpen || !m || m.kind === 'site') return;
    const v = this.exp.library.element(m);
    if (!v) return;
    const d = v.duration || m.duration;
    const k = d ? v.currentTime / d : 0;
    $(this.caseEl, '.case__track').style.setProperty('--k', k.toFixed(4));
    const time = $(this.caseEl, '.case__time');
    const label = `${clock(v.currentTime)} / ${clock(d)}`;
    if (time.textContent !== label) time.textContent = label;
    const btn = $(this.caseEl, '.case__play');
    btn.classList.toggle('is-paused', v.paused);
    btn.setAttribute('aria-label', v.paused ? 'Play' : 'Pause');
    $(this.caseEl, '.case__mute').setAttribute('aria-pressed', String(!v.muted));
  }

  private closeCase(immediate = false) {
    if (!this.caseOpen) return;
    this.caseOpen = false;
    document.body.classList.remove('is-case');
    this.exp.controls.enabled = !this.dir.classList.contains('is-open');
    const gen = ++this.caseGen;
    const frame = $(this.caseEl, '.case__frame');
    const m = this.caseMedia;
    const lib = this.exp.library;
    lib.clearForced();
    this.caseEl.classList.remove('is-open');
    this.caseEl.setAttribute('aria-hidden', 'true');
    const finish = () => {
      if (m) lib.home(m);
      this.caseMedia = null;
      $(this.caseEl, '.case__media').replaceChildren();
      frame.style.cssText = '';
      frame.classList.remove('is-flying', 'is-swapping');
    };
    const desk = this.focused;
    if (desk && m && !immediate) {
      // fly back into the screen it came from
      const to = frame.getBoundingClientRect();
      const from = this.exp.screenRect(desk, deviceFor(m));
      frame.classList.add('is-flying');
      frame.style.transform = `translate(${from.x - to.left}px, ${from.y - to.top}px) scale(${from.w / to.width}, ${from.h / to.height})`;
      setTimeout(() => {
        if (gen !== this.caseGen) return;
        frame.style.transition = 'opacity .25s';
        frame.style.opacity = '0';
        setTimeout(() => gen === this.caseGen && finish(), 260);
      }, 860);
    } else {
      finish();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Index                                                               */
  /* ------------------------------------------------------------------ */

  private toggleDirectory(open: boolean, about = false) {
    this.dir.classList.toggle('is-open', open);
    this.dir.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('is-index', open);
    this.exp.controls.enabled = !open && !this.caseOpen;
    if (open) {
      const page = $(this.dir, '.directory__page');
      if (about) setTimeout(() => $(this.dir, '#about').scrollIntoView({ behavior: 'smooth', block: 'start' }), 420);
      else page.scrollTop = 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Desk tag: a surveyor's callout                                      */
  /* ------------------------------------------------------------------ */

  private showTag(desk: Desk, project: Project | null) {
    if (this.pointer) this.pointer.overDesk = true;
    if (desk === this.tagDesk) return;
    const card = $(this.tag, '.tag__card');
    const moving = !!this.tagDesk;
    this.tagDesk = desk;
    card.innerHTML = project
      ? /* html */ `
        <span class="tag__num">Desk ${pad(desk.number)}</span>
        <span class="tag__title">${project.title}</span>
        <span class="tag__sub">${project.kind}</span>`
      : /* html */ `
        <span class="tag__num">Desk ${pad(desk.number)}</span>
        <span class="tag__title">Open desk</span>
        <span class="tag__sub">Waiting for your project</span>`;
    this.tag.classList.toggle('is-vacant', !project);

    // measure the new content; when already showing, ease the width across
    card.style.width = '';
    const width = card.offsetWidth;
    if (moving && this.tagWidth && Math.abs(width - this.tagWidth) > 0.5) {
      card.style.width = `${this.tagWidth}px`;
      void card.offsetWidth;
      card.style.width = `${width}px`;
    }
    this.tagWidth = width;

    // the stake is planted in the desk top, under the flag
    this.stake.copy(desk.labelAnchor).setY(STAKE_Y);
    if (moving) {
      this.tagGlide = 0;
    } else {
      const p = this.exp.project(this.stake);
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
    const p = this.exp.project(this.stake);
    // the pole runs up to where the flag clears the monitor, however the camera looks at it
    const flag = this.exp.project(d.labelAnchor);
    this.tag.style.setProperty('--pole', `${Math.max(16, p.y - flag.y).toFixed(1)}px`);
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

  /** The dock is one control that changes its mind: a hint, then a way home. */
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
    this.opening.tick(dt);
    this.tickCase();
    this.audio.setVeil(this.exp.fog);
    this.audio.duck(this.exp.library.speaking);

    const away = this.exp.rig.mode === 'overview' && !this.exp.rig.isHome();
    document.body.classList.toggle('is-away', away);
    this.setDock(this.focused ? 'none' : away ? 'reset' : this.hintSpent ? 'none' : 'hint');

    this.pointer?.update(dt);
    requestAnimationFrame(this.frame);
  };
}

/**
 * Film grain, made once: a tile of grey noise the paper, the film and the
 * opening all lay over themselves. The scene's own grain is a post effect.
 */
function grain() {
  const size = 160;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
}

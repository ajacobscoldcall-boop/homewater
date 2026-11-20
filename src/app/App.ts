/**
 * The game shell: screens, the fixed-step loop, saving, and the flow from
 * one life to the next. The simulation lives in src/sim; drawing in src/render.
 */
import { AUDIO } from '../audio/config';
// Photo mode (src/ui/photoMode.ts, src/render/photoRig.ts): openPhoto / closePhoto below.
import { PhotoMode } from '../ui/photoMode';
import { AudioEngine } from '../audio/engine';
import type { Phase } from '../audio/mood';
import paramFile from '../data/params.json';
import { Input } from '../input/input';
import { Renderer } from '../render/Renderer';
import { Graphics, isQualitySetting, quality, type QualitySetting } from '../render/quality';
import { detectSoftwareGL } from '../render/qualityRender';
import {
  advanceGeneration,
  foundFromStray,
  foundLineage,
  markExtinct,
  NAMES,
  offerOffspring,
  recordLife,
  siblingsFor,
  strayRescue,
  type LifeRecord,
  type Lineage,
  type StartPreset,
} from '../sim/lineage';
import { yearFavours } from '../sim/genetics';
import { returnWaterView } from '../sim/stages/returnWater';
import { waterBars } from '../ui/waterHud';
import { Params, type Difficulty, type ParamFile } from '../sim/params';
import { alevinView } from '../sim/stages/egg';
import { fryGrowth } from '../sim/stages/fry';
import { imprintOf } from '../sim/imprint';
import { TRAIT_IDS, type FishIdentity, type Habitat, type SimEvent, type Sex, type StageId, type TraitValues } from '../sim/types';
import { World } from '../sim/world';
import { addToArchive, clearSave, exportSave, importSave, readSave, requestPersistence, writeSave, SCHEMA_VERSION, type LifeSave, type SaveFile } from '../save/save';
import { $, h, show } from '../ui/dom';
import { HudView, type ThreatMarker } from '../ui/hudView';
import { titleLinks } from '../ui/about';
import { hasRecording, loadNarration, narrate, onSpeaking, recordingUrl, setNarrationVolume } from '../ui/narration';
import { caption, DEATH_TITLES, OBJECTIVES, sexSymbol, STAGE_TITLES, stageCardLine, traitLines, yearLine } from '../ui/text';
// Field journal and guided first life: see the section of the same name below.
import { FieldJournal, journalPanel, showJournalToast } from '../ui/journal';
import { Guide } from '../ui/tutorial';
// Lineage depth: drawn family tree, records, extinction screen, Lineages page (see the section of the same name below).
import { extinctionPanel, familyTree, lineagesPanel, recapLineage } from '../ui/lineageView';
import { populationCardLine, populationRecapLine } from '../ui/populationView';
// Controls and readability: see the section of the same name below.
import { k } from '../input/bindings';
import { accessPanel, applyAccess, gameSpeed } from '../ui/accessibility';
import { controlsPanel, controlsSummary, hudHint } from '../ui/controls';
// Gore setting: wounds, death beats and the post-spawn sequence (src/render/gore.ts, src/ui/endSequence.ts).
import { deathBeatPlan, endCards } from '../render/goreConfig';
import { playDeathBeat, playEndSequence } from '../ui/endSequence';

const FILE = paramFile as ParamFile;

type Mode = 'menu' | 'playing' | 'paused' | 'photo';

interface Settings {
  gore: 'unflinching' | 'documentary';
  /** Sound volume, 0..1. */
  volume: number;
  muted: boolean;
  /** Graphics preset (src/render/quality.ts). */
  quality: QualitySetting;
}

/** Threat states that get a marker: hot ones (attacking) and warnings. */
const HOT = new Set(['chase', 'strike', 'lunge', 'charge', 'dive', 'hooked']);
const WARN = new Set(['warn', ...HOT]);

const DEFAULT_VOLUME: number = AUDIO.master.defaultVolume;
/** ?quality=low|medium|high|auto overrides the saved graphics setting for one load. */
const QUALITY_URL_PARAM = 'quality';

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('homewater.settings') ?? '{}') as Partial<Settings>;
    const volume = typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULT_VOLUME;
    return { gore: s.gore === 'documentary' ? 'documentary' : 'unflinching', volume, muted: s.muted === true, quality: isQualitySetting(s.quality) ? s.quality : 'auto' };
  } catch {
    return { gore: 'unflinching', volume: DEFAULT_VOLUME, muted: false, quality: 'auto' };
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem('homewater.settings', JSON.stringify(s));
  } catch {
    // ignore
  }
}

export class App {
  readonly renderer: Renderer;
  /** Graphics quality: the player's preset, and Auto stepping down on slow machines. */
  readonly graphics: Graphics;
  readonly input: Input;
  readonly audio = new AudioEngine({ has: hasRecording, url: recordingUrl });
  params: Params = new Params(FILE, 'fieldGuide');
  mode: Mode = 'menu';
  lineage: Lineage | null = null;
  world: World | null = null;
  archive: Lineage[] = [];
  settings = loadSettings();
  hudDetailed = false;
  private deaths: LifeRecord['deaths'] = [];
  /** Offspring on offer at the end of a life, until one is chosen. Saved, so a reload reopens the choice. */
  private pendingKids: FishIdentity[] | null = null;
  private lifeSeed = 1;
  private acc = 0;
  private last = performance.now();
  private fps = 0;
  private captionEls: HTMLElement[] = [];
  /** HUD elements and the values last written to them (src/ui/hudView.ts). */
  private hud = new HudView();
  private flashTimer = 0;
  /** On the title screen (or setting up a new lineage from it). */
  private atTitle = true;
  /** In the end-of-life sequence and recap. */
  private ending = false;
  readonly debug = new URLSearchParams(location.search).has('debug');

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Quality first: the WebGL context's antialiasing is fixed when it is made.
    // ?quality=low|medium|high|auto overrides the saved setting for this load (review screenshots).
    const urlQuality = new URLSearchParams(location.search).get(QUALITY_URL_PARAM);
    this.graphics = new Graphics(isQualitySetting(urlQuality) ? urlQuality : this.settings.quality, detectSoftwareGL() ? 'low' : 'high');
    this.renderer = new Renderer(canvas);
    this.renderer.applyQuality(quality, false);
    this.graphics.onChange = (q, change) => {
      this.renderer.applyQuality(q, change.rebuild);
      this.refreshGraphicsControls();
    };
    this.input = new Input(canvas);
    this.photo = new PhotoMode({ renderer: this.renderer, stageId: () => this.world?.stageId ?? 'photo', leave: () => this.closePhoto() });
    this.input.onKey = (code) => this.onKey(code);
    this.renderer.gore.mode = this.settings.gore;
    canvas.addEventListener('click', () => {
      if (this.mode === 'playing') this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'playing' && this.world?.status === 'playing' && this.wasLocked) this.pause();
      this.wasLocked = !!document.pointerLockElement;
    });
    window.addEventListener('resize', () => this.resize());
    // Browsers only allow sound after a user gesture: start it on the first one.
    const unlock = () => this.audio.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', (e) => e.key !== 'Escape' && unlock(), true);
    onSpeaking((on) => this.audio.setDucked(on));
    this.applySound();
    applyAccess();
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  private wasLocked = false;
  /** Photo mode's panel and controls; the mode it was opened from comes back on leaving. */
  readonly photo: PhotoMode;
  private photoFrom: 'playing' | 'paused' = 'playing';

  async boot(): Promise<void> {
    void requestPersistence();
    void loadNarration();
    const save = await readSave();
    if (save) this.archive = save.archive ?? [];
    this.showTitle(save);
  }

  private resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  // ---------- Loop ----------

  private frame(now: number): void {
    const frameDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = this.fps * 0.9 + (frameDt > 0 ? 1 / frameDt : 60) * 0.1;
    const w = this.world;
    if (w && this.mode === 'playing' && w.status === 'playing') {
      this.acc += frameDt * gameSpeed(); // the slow-game option steps the fixed 60 Hz sim less often
      let steps = 0;
      while (this.acc >= w.dt && steps < 8) {
        w.step(this.input.consume());
        this.acc -= w.dt;
        steps++;
        if (w.status !== 'playing') break;
      }
      this.handleEvents(w.drainEvents());
      this.afterStatus(w);
      // Auto quality measures frame times only while the game is being played.
      this.graphics.frame(now / 1000, w.stageIndex);
    } else {
      this.acc = 0;
    }
    if (this.mode === 'photo') this.photo.frame(frameDt);
    if (w) {
      this.renderer.cinematics.running = this.mode === 'playing'; // cinematic shots hold while paused
      this.renderer.render(w, frameDt);
      this.updateHud(w, frameDt);
    }
    this.audio.update(frameDt, w, this.audioPhase());
    if (this.debug) this.updateDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Advance the simulation by n steps (tests and playtest tools). */
  stepSim(n: number): void {
    const w = this.world;
    if (!w || this.mode === 'photo') return; // nothing in the sim changes in photo mode
    for (let i = 0; i < n && w.status === 'playing'; i++) w.step(this.input.consume());
    this.handleEvents(w.drainEvents());
    this.afterStatus(w);
  }

  private handleEvents(events: SimEvent[]): void {
    this.audio.onEvents(events);
    this.renderer.gore.onEvents(events, this.world);
    this.renderer.cinematics.onEvents(events, this.world);
    this.journalAndGuideEvents(events);
    for (const ev of events) {
      if (ev.type === 'caption' || ev.type === 'reveal' || ev.type === 'spawned') {
        if (ev.key) {
          this.showCaption(ev.key, ev.vars, false);
          this.lastCaption = caption(ev.key, ev.vars);
        }
      } else if (ev.type === 'warning') {
        this.flash(ev.key === 'opening' ? 'opening' : 'on');
      } else if (ev.type === 'checkpoint') {
        // Mid-stage checkpoints (fry winter, second summer, home river) are kept on disk too.
        void this.save();
      }
    }
  }

  private lastHandledStatus = '';
  private lastCaption: string | null = null;
  /** Events from a stage's start, shown once the player presses Begin/Continue. */
  private pending: SimEvent[] = [];

  private afterStatus(w: World): void {
    const key = `${w.status}:${w.stageIndex}:${w.time.toFixed(3)}`;
    if (w.status === 'playing' || this.lastHandledStatus === key) return;
    this.lastHandledStatus = key;
    if (w.status === 'stageComplete') this.onStageComplete(w);
    else if (w.status === 'dead') this.onDeath(w);
    else if (w.status === 'lifeComplete') void this.onLifeComplete(w);
  }

  // ---------- HUD ----------

  private showCaption(id: string, vars: Record<string, string | number> = {}, warn = false): void {
    const text = caption(id, vars);
    if (!text) return;
    narrate(id, vars);
    const box = $('hud-captions');
    const el = h('div', { class: `caption${warn ? ' warn' : ''}`, 'data-caption-id': id }, text);
    box.append(el);
    this.captionEls.push(el);
    while (this.captionEls.length > 3) this.captionEls.shift()?.remove();
    const ms = Math.min(11000, 3500 + text.length * 45);
    setTimeout(() => el.classList.add('fade'), ms);
    setTimeout(() => {
      el.remove();
      this.captionEls = this.captionEls.filter((c) => c !== el);
    }, ms + 700);
  }

  private clearCaptions(): void {
    $('hud-captions').replaceChildren();
    this.captionEls = [];
  }

  private flash(kind: 'on' | 'opening'): void {
    const el = $('flash');
    el.className = kind;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => (el.className = ''), kind === 'opening' ? 900 : 650);
  }

  private updateHud(w: World, _frameDt: number): void {
    // Performance: HudView writes to the DOM only when something shown has changed.
    const hud = this.hud;
    const f = w.fish;
    const sibs = '◆'.repeat(Math.max(0, w.siblingsLeft));
    const who = ` · ${sexSymbol(f.sex)} · generation ${f.generation} · ${STAGE_TITLES[w.stageId]}`;
    const sibText = `siblings ${sibs || 'none'}`;
    hud.children('hud-who', `${f.name}|${who}|${sibText}`, () => [h('b', {}, f.name), who, h('br'), sibText]);
    const guided = w.firstLife && this.lineage?.difficulty === 'fieldGuide';
    this.guideFrame(w, _frameDt);
    hud.text('hud-objective', (guided && !this.guided(w)) || this.hudDetailed ? OBJECTIVES[w.stageId] : '');
    hud.text('hud-hint', this.mode === 'playing' ? hudHint(this.input.locked) : '');

    // Immersive state: the edges darken as the fish weakens.
    const alevin = alevinView(w);
    const fat = w.stageId === 'return' ? w.progress.fat : 1;
    const danger = alevin ? Math.max(alevin.exposure, alevin.drift) : 0;
    const weakness = Math.max(1 - w.body.energy, danger, 1 - fat * 2.2);
    hud.style('vignette', 'opacity', String(Math.max(0, Math.min(0.95, (weakness - 0.35) * 1.4))));

    this.updateThreats(w);

    hud.hidden('hud-bars', !this.hudDetailed);
    if (this.hudDetailed) {
      const rows: [string, number][] = [];
      if (alevin) rows.push(['yolk', w.progress.yolk], ['hold', 1 - alevin.drift], ['daylight', alevin.light]);
      else rows.push(['energy', w.body.energy]);
      if (w.stageId === 'fry') rows.push(['growth', fryGrowth(w)]);
      if (w.stageId === 'return') rows.push(['fat', w.progress.fat]);
      // Imprinting (src/sim/imprint.ts): how well the fish has learned the smell of home.
      if (w.stageId !== 'ocean' && w.stageId !== 'spawn') rows.push(['home scent', imprintOf(w.p, w.progress)]);
      if (!alevin) rows.push(['depth', Math.min(1, (w.arena.surfaceY - w.body.pos.y) / 8)]);
      const bars = rows.map(([name, value]) => ({ name, value, low: value < 0.25 && name !== 'depth' && name !== 'daylight' }));
      const water = returnWaterView(w);
      if (water) bars.push(...waterBars(w.p, water));
      hud.bars('hud-bars', bars);
    }
  }

  /** Markers on threats that are warning or attacking; arrows at the edge for ones off screen. */
  private updateThreats(w: World): void {
    if (this.mode !== 'playing' || w.status !== 'playing') {
      this.hud.threats('threats', []);
      return;
    }
    const LABEL: Partial<Record<string, string>> = { lure: 'hooked', shark: 'shark', trout: w.stageId === 'fry' ? 'dolly varden' : 'char', birdShadow: 'bird', merganser: 'merganser', seal: 'seal', orca: 'orca', bear: 'bear', rival: 'rival' };
    const items: ThreatMarker[] = [];
    const add = (px: number, py: number, pz: number, label: string, hot: boolean, opening = false) => {
      const s = this.renderer.project(px, py, pz);
      let x = s.x;
      let y = s.y;
      if (s.behind) {
        x = 1 - x;
        y = 1 - y;
      }
      const off = s.behind || x < 0.04 || x > 0.96 || y < 0.06 || y > 0.94;
      const dx = x - 0.5;
      const dy = y - 0.5;
      if (off) {
        const k = 0.44 / Math.max(Math.abs(dx), Math.abs(dy), 1e-3);
        x = 0.5 + dx * k;
        y = 0.5 + dy * k;
      }
      items.push({ x, y, label, hot, opening, off, angle: Math.atan2(dy, dx) });
    };
    for (const e of w.entities) {
      if (!e.alive) continue;
      const label = LABEL[e.kind];
      if (!label) continue;
      const rivalActive = e.kind === 'rival' && e.state === 'approach';
      if (!WARN.has(e.state) && !rivalActive) continue;
      if (e.kind === 'trout' && e.state === 'chase' && e.value) continue; // chasing a school-mate
      const target = e.kind === 'bear' && e.home ? e.home : e.pos;
      add(target.x, e.kind === 'bear' || e.kind === 'birdShadow' ? 0 : target.y, target.z, label, HOT.has(e.state));
    }
    const female = w.live('female')[0];
    if (female && w.stageId === 'spawn' && w.live('rival').some((r) => r.state === 'fight')) add(female.pos.x, female.pos.y, female.pos.z, 'now', true, true);
    this.hud.threats('threats', items.slice(0, 8));
  }

  private onKey(code: string): void {
    if (this.mode === 'photo') return this.photoKey(code);
    if (code === 'KeyP' && this.mode === 'playing') return this.openPhoto();
    if (this.journalKey(code)) return;
    if (code === 'Escape' && this.mode === 'playing') this.pause();
    else if (code === 'Escape' && this.mode === 'paused') this.resume();
    else if (code === 'KeyV') this.renderer.cameraMode = this.renderer.cameraMode === 'third' ? 'first' : 'third';
    else if (code === 'KeyH') this.hudDetailed = !this.hudDetailed;
    else if (code === 'KeyM') this.toggleMute();
  }

  // ---------- Sound ----------

  private audioPhase(): Phase {
    if (this.ending) return 'end';
    if (this.atTitle) return 'title';
    return this.mode === 'playing' ? 'playing' : this.mode === 'paused' || this.mode === 'photo' ? 'paused' : 'menu';
  }

  private applySound(): void {
    const { volume, muted } = this.settings;
    this.audio.setVolume(volume);
    this.audio.setMuted(muted);
    setNarrationVolume(muted ? 0 : volume);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sound-mute]')) {
      b.setAttribute('aria-pressed', String(muted));
      b.textContent = muted ? `Sound off (${k('sound')})` : `Sound on (${k('sound')})`;
    }
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    saveSettings(this.settings);
    this.applySound();
  }

  /** Volume slider and mute toggle, for the title screen and the pause menu. */
  private soundControls(): HTMLElement {
    const muted = this.settings.muted;
    const volume = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(this.settings.volume), 'aria-label': 'Volume', id: 'sound-volume' });
    volume.addEventListener('input', () => {
      this.settings.volume = Number(volume.value);
      saveSettings(this.settings);
      this.applySound();
    });
    const mute = h('button', { 'data-sound-mute': true, 'aria-pressed': String(muted), onclick: () => this.toggleMute() }, muted ? `Sound off (${k('sound')})` : `Sound on (${k('sound')})`);
    return h('div', { class: 'row sound' }, mute, h('label', { class: 'volume' }, 'Volume', volume));
  }

  /** Graphics preset buttons, for the title screen and the pause menu. */
  private graphicsControls(): HTMLElement {
    const pick = (q: QualitySetting) => {
      this.settings.quality = q;
      saveSettings(this.settings);
      this.graphics.set(q);
      this.refreshGraphicsControls();
    };
    const labels: Record<QualitySetting, string> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };
    const buttons = (['auto', 'low', 'medium', 'high'] as const).map((q) =>
      h('button', { 'data-quality': q, 'aria-pressed': String(this.graphics.setting === q), onclick: () => pick(q) }, labels[q]),
    );
    const row = h('div', { class: 'row graphics' }, ...buttons, h('span', { class: 'muted', 'data-quality-note': true }));
    queueMicrotask(() => this.refreshGraphicsControls());
    return row;
  }

  private refreshGraphicsControls(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === this.graphics.setting));
    const note = this.graphics.setting === 'auto' ? `Now ${this.graphics.current()}. Steps down if the game runs slowly.` : '';
    const aa = this.graphics.antialiasPending ? ' Smoother edges change the next time the game loads.' : '';
    for (const el of document.querySelectorAll<HTMLElement>('[data-quality-note]')) el.textContent = (note + aa).trim();
  }

  // ---------- Screens ----------

  private screen(...nodes: Node[]): void {
    show($('screen'), ...nodes);
  }

  private clearScreen(): void {
    $('screen').replaceChildren();
  }

  showTitle(save: SaveFile | null): void {
    this.renderer.cinematics.stop();
    this.titleSave = save;
    this.mode = 'menu';
    this.atTitle = true;
    this.ending = false;
    this.input.releaseLock();
    $('hud').hidden = true;
    const goreBtn = (g: Settings['gore'], label: string, desc: string) =>
      h(
        'button',
        {
          class: 'choice',
          'aria-pressed': String(this.settings.gore === g),
          onclick: () => {
            this.settings.gore = g;
            this.renderer.gore.mode = g;
            saveSettings(this.settings);
            this.showTitle(save);
          },
        },
        label,
        h('span', {}, desc),
      );
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const s = await importSave(file);
        if (save && save.lineage.id !== s.lineage.id && save.lineage.records.length) s.archive = addToArchive(s.archive, save.lineage);
        await writeSave(s);
        // The imported line replaces whatever was loaded here, so a New lineage archives it, not a stale one.
        this.lineage = null;
        this.world = null;
        this.archive = s.archive ?? [];
        this.showTitle(s);
      } catch (e) {
        alertBox(this, `Couldn't import that file: ${(e as Error).message}`, () => this.showTitle(save));
      }
    });
    this.screen(
      h(
        'div',
        { class: 'panel' },
        h('p', { class: 'label' }, 'A sockeye salmon lifecycle simulator'),
        h('h1', {}, 'Home', h('span', {}, 'water')),
        h('p', {}, 'Live one sockeye’s whole life, from an egg in the gravel to its death on the spawning grounds. Then carry on as one of its offspring.'),
        h(
          'p',
          { class: 'warning-box' },
          'Content warning: this game shows predation, deaths from fishing, wounds and decay. Unflinching shows them plainly, with blood in the water; Documentary cuts away before the worst. You can change this below at any time.',
        ),
        save && !save.lineage.extinct
          ? h(
              'div',
              { class: 'row' },
              h('button', { class: 'primary', id: 'btn-continue', onclick: () => this.continueSave(save) }, !save.life && save.pendingOffspring?.length ? `Continue: choose ${save.lineage.current.name}’s offspring` : `Continue: ${save.lineage.current.name}, generation ${save.lineage.generation}`),
              h('button', { id: 'btn-new', onclick: () => this.showSetup() }, 'New lineage'),
            )
          : h(
              'div',
              { class: 'row' },
              save?.lineage.extinct ? h('button', { class: 'primary', id: 'btn-stray-title', onclick: () => this.strayFromTitle(save) }, 'A stray from this river') : null,
              h('button', { class: save?.lineage.extinct ? '' : 'primary', id: 'btn-new', onclick: () => this.showSetup() }, 'New lineage'),
            ),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => fileInput.click() }, 'Import lineage file'),
          save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
          h('button', { id: 'btn-journal', onclick: () => this.openJournal(() => this.showTitle(save)) }, 'Field journal'),
          h('button', { id: 'btn-lineages', onclick: () => this.showLineages(save) }, 'Lineages and records'),
          ...this.optionButtons(() => this.showTitle(save)),
          fileInput,
        ),
        titleLinks((panel) => this.screen(panel), () => this.showTitle(save)),
        h('p', { class: 'label' }, 'Gore'),
        h('div', { class: 'grid3' }, goreBtn('unflinching', 'Unflinching', 'Predation and decay shown plainly.'), goreBtn('documentary', 'Documentary', 'Deaths cut away before the worst of it.')),
        h('p', { class: 'label' }, 'Sound'),
        this.soundControls(),
        h('p', { class: 'label' }, 'Graphics'),
        this.graphicsControls(),
        h('p', { class: 'muted' }, 'Prototype build. Saves stay in this browser; export your lineage to keep it safe.'),
      ),
    );
  }

  private showSetup(): void {
    let preset: StartPreset = 'quick';
    let sex: Sex = 'F';
    let difficulty: Difficulty = 'fieldGuide';
    let habitat: Habitat = 'creek';
    const custom: TraitValues = Object.fromEntries(TRAIT_IDS.map((t) => [t, 0])) as TraitValues;
    const labels: Record<string, [string, string, string]> = {
      size: ['Size', 'small', 'large'],
      jack: ['Jack tendency', 'large male', 'jack'],
      runTiming: ['Run timing', 'early', 'late'],
      oceanAge: ['Sea years', 'fewer', 'more'],
      homing: ['Homing', 'wanders', 'faithful'],
      bodyDepth: ['Body', 'streamlined', 'deep'],
      eggTradeoff: ['Eggs', 'many, small', 'few, large'],
    };
    const render = () => {
      const choice = (value: StartPreset, title: string, desc: string) =>
        h('button', { class: 'choice', 'aria-pressed': String(preset === value), 'data-preset': value, onclick: () => ((preset = value), render()) }, title, h('span', {}, desc));
      const sexBtn = (s: Sex) => h('button', { class: 'choice', 'aria-pressed': String(sex === s), disabled: preset === 'jack', onclick: () => ((sex = s), render()) }, sexSymbol(s));
      const habBtn = (hb: Habitat, title: string, desc: string) =>
        h('button', { class: 'choice', 'aria-pressed': String(habitat === hb), 'data-habitat': hb, onclick: () => ((habitat = hb), render()) }, title, h('span', {}, desc));
      const diffBtn = (d: Difficulty, title: string, desc: string) =>
        h('button', { class: 'choice', 'aria-pressed': String(difficulty === d), onclick: () => ((difficulty = d), render()) }, title, h('span', {}, desc));
      const sliders =
        preset === 'custom'
          ? h(
              'div',
              { class: 'sliders' },
              ...TRAIT_IDS.map((t) => {
                const [name, lo, hi] = labels[t] ?? [t, 'low', 'high'];
                const out = h('output', {}, custom[t] === 0 ? 'average' : custom[t] < 0 ? lo : hi);
                const input = h('input', { type: 'range', min: '-2', max: '2', step: '0.25', value: String(custom[t]), 'aria-label': name });
                input.addEventListener('input', () => {
                  custom[t] = Number(input.value);
                  out.textContent = custom[t] === 0 ? 'average' : custom[t] < 0 ? lo : hi;
                });
                return h('label', { class: 'slider' }, name, input, out);
              }),
            )
          : null;
      this.screen(
        h(
          'div',
          { class: 'panel' },
          h('h2', {}, 'Start a lineage'),
          h('div', { class: 'grid3' }, choice('quick', 'Quick start', 'A typical young sockeye.'), choice('custom', 'Custom', 'Set the starting traits yourself.'), choice('jack', 'Start as a jack', 'A male locked into early maturation: small, quick, a sneaker.')),
          h('p', { class: 'label' }, 'Sex'),
          h('div', { class: 'grid3' }, sexBtn('F'), sexBtn('M')),
          sliders,
          h('p', { class: 'label' }, 'Home spawning ground'),
          h(
            'div',
            { class: 'grid3' },
            habBtn('creek', 'Small creek', 'Shallow, with bank cover. Jacks are commonest here, and bears catch fish most easily.'),
            habBtn('river', 'River', 'Deeper and faster. Larger, deeper-bodied fish, and bears catch fewer.'),
            habBtn('beach', 'Lake beach', 'Still water on a lake shore. The largest fish; little cover.'),
          ),
          h('p', { class: 'label' }, 'Difficulty'),
          h('div', { class: 'grid3' }, diffBtn('fieldGuide', 'Field guide', 'Forgiving. Five siblings per life. Recommended.'), diffBtn('wild', 'Wild', 'Harsher, closer to real odds. Three siblings.')),
          h(
            'div',
            { class: 'row' },
            h('button', { onclick: () => void readSave().then((s) => this.showTitle(s)) }, 'Back'),
            h(
              'button',
              {
                class: 'primary',
                id: 'btn-setup-next',
                onclick: () => {
                  const seed = Math.floor(Math.random() * 2 ** 31);
                  this.showNaming(seed, [], (name) => {
                    this.params = new Params(FILE, difficulty);
                    this.retireLineage();
                    const opts = { preset, sex: preset === 'jack' ? ('M' as Sex) : sex, name, difficulty, seed, habitat, ...(preset === 'custom' ? { custom } : {}) };
                    this.lineage = foundLineage(this.params, opts);
                    this.deaths = [];
                    this.pendingKids = null;
                    this.startLife(null);
                  });
                },
              },
              'Next',
            ),
          ),
        ),
      );
    };
    render();
  }

  /** Suggested name with accept, reroll, or type your own. */
  private showNaming(seed: number, used: string[], done: (name: string) => void, context?: Node): void {
    let n = seed;
    const next = () => {
      n = (n * 1103515245 + 12345) >>> 0;
      const pool = NAME_POOL.filter((x) => !used.includes(x));
      return pool[n % pool.length] ?? 'Alder';
    };
    let suggestion = next();
    const own = h('input', { type: 'text', id: 'own-name', placeholder: 'Or type a name', maxlength: '24' });
    const nameEl = h('h2', { id: 'suggested-name' }, suggestion);
    this.screen(
      h(
        'div',
        { class: 'panel' },
        context ?? null,
        h('p', { class: 'label' }, 'Name this fish'),
        nameEl,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', id: 'btn-accept-name', onclick: () => done((own.value.trim() || suggestion).slice(0, 24)) }, 'Accept'),
          h('button', { id: 'btn-reroll', onclick: () => ((suggestion = next()), (nameEl.textContent = suggestion)) }, 'Another name'),
        ),
        h('div', { class: 'row' }, own),
      ),
    );
    own.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done((own.value.trim() || suggestion).slice(0, 24));
    });
  }

  private continueSave(save: SaveFile): void {
    this.lineage = save.lineage;
    this.archive = save.archive ?? [];
    this.params = new Params(FILE, save.lineage.difficulty);
    this.deaths = save.life?.deaths ?? [];
    this.pendingKids = save.life ? null : (save.pendingOffspring ?? null);
    const last = save.lineage.records.at(-1);
    if (this.pendingKids?.length && last) {
      this.atTitle = false;
      this.showOffspringChoice(last, this.pendingKids);
      return;
    }
    this.pendingKids = null;
    this.startLife(save.life);
  }

  private startLife(resume: LifeSave | null): void {
    const l = this.lineage;
    if (!l) return;
    this.atTitle = false;
    this.ending = false;
    this.lifeSeed = resume?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const firstLife = resume?.firstLife ?? l.records.length === 0;
    const w = new World(this.params, {
      fish: l.current,
      conditions: l.conditions,
      difficulty: l.difficulty,
      siblings: resume?.siblingsLeft ?? siblingsFor(this.params, l),
      seed: this.lifeSeed,
      firstLife,
    });
    if (resume) {
      // The constructor starts the egg stage; drop its events so they don't show over the resumed stage.
      w.drainEvents();
      w.restore(resume.checkpoint);
      w.siblingsLeft = resume.siblingsLeft;
      // The saved fish had just died (the save was made on its death screen): reopen that screen.
      const last = resume.deaths.at(-1);
      if (last && last.name === l.current.name) {
        this.world = w;
        w.die(last.cause);
        w.drainEvents();
        this.pending = [];
        this.showDeath(w);
        return;
      }
    }
    this.world = w;
    this.clearCaptions();
    this.pending = w.drainEvents();
    void this.save();
    this.showStageCard(w);
  }

  private showStageCard(w: World, note: string | null = null): void {
    this.clearCaptions();
    this.mode = 'menu';
    this.input.releaseLock();
    $('hud').hidden = true;
    const l = this.lineage;
    this.screen(
      h(
        'div',
        { class: 'panel' },
        note ? h('p', { class: 'muted', id: 'stage-note' }, note) : null,
        h('p', { class: 'label' }, `Stage ${w.stageIndex + 1} of 6 · ${w.fish.name}`),
        h('h2', {}, STAGE_TITLES[w.stageId]),
        h('p', {}, stageCardLine(w.stageId, w.progress.oceanYears)),
        w.stageIndex === 0 && l ? h('p', { class: 'muted' }, yearLine(l.conditions)) : null,
        populationCardLine(this.params, w.stageId, w.conditions),
        h('p', { class: 'muted' }, OBJECTIVES[w.stageId]),
        h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-play', onclick: () => this.play() }, w.stageIndex === 0 ? 'Begin' : 'Continue')),
      ),
    );
  }

  private play(): void {
    const w = this.world;
    if (!w) return;
    this.audio.unlock();
    this.clearScreen();
    $('hud').hidden = false;
    this.mode = 'playing';
    this.input.clear();
    this.last = performance.now();
    // Show the stage's opening captions now that the HUD is visible.
    this.handleEvents([...this.pending, ...w.drainEvents()]);
    this.pending = [];
    if (w.stageId !== 'egg') this.input.requestLock();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.releaseLock();
    this.showPauseMenu();
  }

  private showPauseMenu(): void {
    const save = this.currentSave();
    const w = this.world;
    this.screen(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Paused'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.resume() }, 'Resume'),
          h('button', { onclick: () => (this.renderer.cameraMode = this.renderer.cameraMode === 'third' ? 'first' : 'third') }, `Switch view (${k('view')})`),
          h('button', { onclick: () => (this.hudDetailed = !this.hudDetailed) }, `Detailed HUD (${k('details')})`),
          h('button', { id: 'btn-photo', onclick: () => this.openPhoto() }, `Photo mode (${k('photo')})`),
          h('button', { id: 'btn-pause-journal', onclick: () => this.openJournal(() => this.showPauseMenu()) }, `Field journal (${k('journal')})`),
          w && this.guided(w) ? h('button', { onclick: () => (this.skipGuide(), this.showPauseMenu()) }, `Skip guidance (${k('guide')})`) : null,
          ...this.optionButtons(() => this.showPauseMenu()),
          save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
          h('button', { onclick: () => void this.save().then(() => readSave()).then((s) => this.showTitle(s)) }, 'Save and quit to title'),
        ),
        this.soundControls(),
        this.graphicsControls(),
        h('p', { class: 'muted' }, controlsSummary()),
      ),
    );
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.clearScreen();
    this.mode = 'playing';
    this.input.clear();
    this.last = performance.now();
    if (this.world?.stageId !== 'egg') this.input.requestLock();
  }

  // ---------- Photo mode ----------

  /**
   * Open photo mode from play or the pause menu: the simulation stops (no
   * steps run), the HUD hides, cinematic shots end, and a free camera takes
   * over. Not from cards, death beats or the end sequence (mode 'menu').
   */
  openPhoto(): void {
    const w = this.world;
    if (!w || w.status !== 'playing' || (this.mode !== 'playing' && this.mode !== 'paused') || this.ending || this.journalBack) return;
    this.photoFrom = this.mode;
    this.mode = 'photo'; // before the lock goes, so losing it doesn't pause
    this.renderer.cinematics.stop();
    this.input.releaseLock();
    this.input.clear();
    this.clearScreen();
    document.body.classList.add('photo-mode');
    this.renderer.beginPhoto(w);
    this.photo.show();
  }

  /** Leave photo mode: the camera, HUD and the playing or paused state come back as they were. */
  closePhoto(): void {
    if (this.mode !== 'photo') return;
    this.photo.hide();
    this.renderer.endPhoto();
    document.body.classList.remove('photo-mode');
    this.input.clear();
    this.mode = this.photoFrom;
    if (this.mode === 'paused') return this.showPauseMenu();
    this.last = performance.now();
    if (this.world?.stageId !== 'egg') this.input.requestLock();
  }

  private photoKey(code: string): void {
    if (code === 'Escape' || code === 'KeyP') this.closePhoto();
    else if (code === 'KeyH') this.photo.toggleUi();
    else if (code === 'KeyM') this.toggleMute();
  }

  private onStageComplete(w: World): void {
    this.input.releaseLock();
    const note = this.lastCaption;
    const advanced = w.advance();
    if (!advanced) return;
    this.pending = w.drainEvents();
    void this.save();
    this.showStageCard(w, note);
  }

  private onDeath(w: World): void {
    this.mode = 'menu';
    this.input.releaseLock();
    $('hud').hidden = true;
    // Record the death and save at once, so a reload on the death screen (or during the beat) cannot undo it.
    this.deaths.push({ name: w.fish.name, stage: w.stageId, cause: w.deathCause ?? 'exhaustion' });
    void this.save();
    // Gore: a short, skippable death beat before the death screen, when a predator, a net or a line took the fish.
    const beat = deathBeatPlan(w.deathCause, this.settings.gore);
    if (!beat) return this.showDeath(w);
    this.renderer.gore.startDeathBeat(w, beat);
    void playDeathBeat($('screen'), beat).then(() => {
      if (this.world === w && w.status === 'dead') this.showDeath(w);
    });
  }

  private showDeath(w: World): void {
    const cause = w.deathCause ?? 'exhaustion';
    this.noteJournal([`death.${cause}`]);
    const science = caption(`death.${cause}`) ?? '';
    narrate(`death.${cause}`);
    const l = this.lineage;
    if (!l) return;
    if (w.canContinueWithSibling()) {
      const ctx = h(
        'div',
        { style: 'display:grid;gap:12px' },
        h('p', { class: 'label' }, `${w.fish.name} · ${STAGE_TITLES[w.stageId]}`),
        h('h2', {}, DEATH_TITLES[cause]),
        h('p', {}, science),
        h('p', { class: 'muted' }, `A sibling carries on from the last checkpoint. ${w.siblingsLeft} sibling${w.siblingsLeft === 1 ? '' : 's'} left.`),
      );
      this.showNaming(Math.floor(Math.random() * 1e9), [...l.usedNames, ...this.deaths.map((d) => d.name)], (name) => {
        l.usedNames.push(name);
        w.continueWithSibling(name);
        this.pending = w.drainEvents();
        void this.save();
        this.showStageCard(w);
      }, ctx);
      return;
    }
    // The whole brood is gone.
    const rec = this.lifeRecord(w, false);
    recordLife(l, rec);
    this.deaths = [];
    if (l.difficulty === 'fieldGuide') {
      this.screen(
        h(
          'div',
          { class: 'panel' },
          h('h2', {}, DEATH_TITLES[cause]),
          h('p', {}, science),
          h('p', {}, 'The whole brood is gone. But salmon sometimes stray from other streams, and a stray has found its way into yours.'),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'primary',
                id: 'btn-stray',
                onclick: () =>
                  this.showNaming(Math.floor(Math.random() * 1e9), l.usedNames, (name) => {
                    strayRescue(this.params, l, name);
                    this.startLife(null);
                  }),
              },
              'Continue as the stray',
            ),
          ),
        ),
      );
    } else {
      markExtinct(l);
      this.archive = addToArchive(this.archive, l);
      void this.save();
      this.showExtinction(l, `${DEATH_TITLES[cause]}`, science);
    }
  }

  private lifeRecord(w: World, spawned: boolean): LifeRecord {
    return {
      fishId: w.fish.id,
      name: w.fish.name,
      sex: w.fish.sex,
      generation: w.fish.generation,
      isJack: w.progress.isJack,
      oceanYears: w.progress.oceanYears,
      adultSize: w.progress.adultSize,
      conditions: w.conditions,
      deaths: [...this.deaths],
      spawned,
      result: spawned ? w.spawnResult : null,
      isStray: w.fish.isStray,
      lockedJack: w.fish.lockedJack,
      bv: { ...w.fish.bv },
      habitat: w.fish.habitat,
      offspring: [],
      chosenId: null,
    };
  }

  private async onLifeComplete(w: World): Promise<void> {
    this.mode = 'menu';
    this.ending = true;
    this.input.releaseLock();
    $('hud').hidden = true;
    const l = this.lineage;
    if (!l) return;
    // Record the life and save the offspring on offer first, so a reload during the sequence reopens the choice.
    const rec = this.lifeRecord(w, true);
    recordLife(l, rec);
    this.deaths = [];
    const kids = offerOffspring(this.params, l, w.fish);
    this.pendingKids = kids;
    void this.save();
    // Gore: the post-spawn sequence, a series of fades (skippable); the renderer shows the spent fish and its carcass.
    await playEndSequence($('screen'), endCards(w.fish.sex, this.settings.gore), {
      fast: this.debug || navigator.webdriver,
      onCard: (card) => {
        narrate(card.id);
        this.renderer.gore.setEnding(w, card.scene);
      },
    });
    this.showOffspringChoice(rec, kids);
  }

  /** The recap of a finished life and the choice of the next generation. Built from the saved record, so it can reopen after a reload. */
  private showOffspringChoice(rec: LifeRecord, kids: FishIdentity[]): void {
    const l = this.lineage;
    if (!l) return;
    this.mode = 'menu';
    this.ending = true;
    this.noteJournal(['year.betHedging', ...yearFavours(rec.conditions)]);
    const r = rec.result;
    const role = rec.sex === 'F' ? 'eggs laid' : 'eggs fertilized';
    this.screen(
      h(
        'div',
        { class: 'panel wide' },
        h('p', { class: 'label' }, `Generation ${rec.generation} · ${rec.name}`),
        h('h2', {}, `${r ? r.relativeFitness.toFixed(2) : '0'}× an average spawner`),
        h(
          'dl',
          { class: 'stats' },
          stat(role, r ? r.eggs.toLocaleString() : '0'),
          stat('Life history', rec.sex === 'F' ? `${rec.oceanYears ?? '?'} years at sea` : rec.isJack ? 'Jack, 1 year at sea' : `Large male, ${rec.oceanYears ?? '?'} years at sea`),
          stat('Siblings lost', String(rec.deaths.length)),
          stat('Notes', r?.detail ?? ''),
        ),
        h('p', { class: 'muted' }, yearLine(rec.conditions)),
        populationRecapLine(this.params, rec.conditions),
        h('p', { class: 'muted' }, caption('year.betHedging') ?? ''),
        recapLineage(this.params, l, this.archive),
        h('p', { class: 'label' }, 'Choose the next generation'),
        h(
          'div',
          { class: 'grid3' },
          ...kids.map((k, i) =>
            h(
              'button',
              {
                class: 'choice',
                'data-offspring': String(i),
                onclick: () => this.chooseOffspring(k, kids),
              },
              `${k.name} · ${sexSymbol(k.sex)}`,
              h('span', { class: 'kid-traits' }, ...traitLines(k).map((t) => h('span', {}, t))),
            ),
          ),
        ),
        h('p', { class: 'label' }, 'Family tree'),
        familyTree(l),
      ),
    );
  }

  private chooseOffspring(kid: FishIdentity, kids: FishIdentity[]): void {
    const l = this.lineage;
    if (!l) return;
    const used = [...l.usedNames, ...kids.filter((k) => k !== kid).map((k) => k.name)];
    this.showNaming(
      Math.floor(Math.random() * 1e9),
      used,
      (name) => {
        advanceGeneration(this.params, l, kid, name);
        this.pendingKids = null;
        this.startLife(null);
      },
      h('p', {}, `${sexSymbol(kid.sex)}. ${traitLines(kid).join(' · ')}`),
    );
  }

  // ---------- Field journal and guided first life ----------
  // Journal unlocks are kept per browser (src/ui/journal.ts), not in the save.
  // The guide shows step-by-step objectives in a Field guide first life (src/ui/tutorial.ts).

  private readonly journal = new FieldJournal();
  private readonly guide = new Guide();
  private journalBack: (() => void) | null = null;

  private get lifeKey(): string {
    return this.lineage ? `${this.lineage.id}:${this.lineage.generation}` : '';
  }

  private guided(w: World): boolean {
    return w.firstLife && this.lineage?.difficulty === 'fieldGuide' && !this.guide.isSkipped(this.lifeKey);
  }

  private journalAndGuideEvents(events: SimEvent[]): void {
    const w = this.world;
    showJournalToast(this.journal.recordEvents(events, { habitat: w?.fish.habitat }));
    if (w) this.guide.events(w, events);
  }

  private noteJournal(triggers: string[]): void {
    showJournalToast(this.journal.record(triggers));
  }

  private guideFrame(w: World, dt: number): void {
    this.guide.frame(w, dt, this.mode === 'playing' && w.status === 'playing' && this.guided(w), () => this.skipGuide());
  }

  private skipGuide(): void {
    if (this.world && this.guided(this.world)) this.guide.skip(this.lifeKey);
  }

  private openJournal(back: () => void): void {
    this.journalBack = () => {
      this.journalBack = null;
      back();
    };
    this.screen(journalPanel(this.journal, this.journalBack));
  }

  /** J opens the journal while paused, Esc closes it, G skips guidance. Returns true if handled. */
  private journalKey(code: string): boolean {
    if (code === 'Escape' && this.journalBack) this.journalBack();
    else if (code === 'KeyJ' && this.mode === 'paused' && !this.journalBack) this.openJournal(() => this.showPauseMenu());
    else if (code === 'KeyG' && this.mode === 'playing') this.skipGuide();
    else return false;
    return true;
  }

  // ---------- Lineage depth ----------
  // The drawn tree, records, extinction screen and Lineages page live in src/ui/lineageView.ts.

  /** The save shown on the title screen, so a new lineage can archive the one it replaces. */
  private titleSave: SaveFile | null = null;

  /** Keep the line being replaced (if it got anywhere) in the archive for the Lineages page. */
  private retireLineage(): void {
    const old = this.lineage ?? this.titleSave?.lineage ?? null;
    if (old && old.records.length) this.archive = addToArchive(this.archive, old);
  }

  /** After a reload, an extinct line can still be carried on by a stray into the same river. */
  private strayFromTitle(save: SaveFile): void {
    const l = save.lineage;
    this.params = new Params(FILE, l.difficulty);
    this.archive = save.archive ?? [];
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.showNaming(seed, [], (name) => {
      this.lineage = foundFromStray(this.params, l, seed, name);
      this.deaths = [];
      this.pendingKids = null;
      this.startLife(null);
    });
  }

  private showLineages(save: SaveFile | null): void {
    this.screen(lineagesPanel(this.params, save?.lineage ?? null, save?.archive ?? this.archive, () => this.showTitle(save)));
  }

  private showExtinction(l: Lineage, deathTitle: string, science: string): void {
    const toTitle = () => void readSave().then((s) => this.showTitle(s));
    this.screen(
      extinctionPanel(this.params, l, {
        deathTitle,
        science,
        archive: this.archive,
        onTitle: toTitle,
        onNewLineage: () => this.showSetup(),
        onStray: () => {
          const seed = Math.floor(Math.random() * 2 ** 31);
          this.showNaming(seed, [], (name) => {
            this.lineage = foundFromStray(this.params, l, seed, name);
            this.deaths = [];
            this.pendingKids = null;
            this.startLife(null);
          });
        },
      }),
    );
  }

  // ---------- Controls and readability ----------
  // Key bindings, gamepad, hold/toggle (src/input/bindings.ts, gamepad.ts, src/ui/controls.ts) and
  // readability options (src/ui/accessibility.ts) are kept per browser in localStorage, not in the save.

  /** Controls and Readability buttons, for the title screen and the pause menu. */
  private optionButtons(back: () => void): HTMLElement[] {
    return [
      h('button', { id: 'btn-controls', onclick: () => this.screen(controlsPanel(back)) }, 'Controls'),
      h('button', { id: 'btn-access', onclick: () => this.screen(accessPanel(back)) }, 'Readability'),
    ];
  }

  // ---------- Saving ----------

  currentSave(): SaveFile | null {
    const l = this.lineage;
    if (!l) return null;
    const w = this.world;
    const active = w && w.status !== 'lifeComplete' && w.fish.generation === l.current.generation;
    const life: LifeSave | null = active
      ? { checkpoint: w.checkpoint, siblingsLeft: w.siblingsLeft, firstLife: w.firstLife, seed: this.lifeSeed, deaths: [...this.deaths] }
      : null;
    if (active) l.current = w.fish;
    return { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), game: 'homewater', lineage: l, life, pendingOffspring: active ? null : this.pendingKids, archive: this.archive };
  }

  async save(): Promise<void> {
    const s = this.currentSave();
    if (s) await writeSave(s);
  }

  async newGameReset(): Promise<void> {
    await clearSave();
  }

  // ---------- Playtest tools ----------

  private debugEl: HTMLElement | null = null;
  private debugLast = 0;

  private updateDebug(): void {
    const el = $('debug');
    el.hidden = false;
    if (!this.debugEl) {
      this.debugEl = el;
      const w = () => this.world;
      el.append(
        h('div', { id: 'dbg-stats' }),
        h('div', { class: 'row' }, ...['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'].map((s, i) => h('button', { onclick: () => this.debugJump(i) }, s))),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => (w()?.debugComplete(), w() && this.afterStatus(w() as World)) }, 'Complete stage'),
          h('button', { onclick: () => (w()?.die('exhaustion'), w() && this.afterStatus(w() as World)) }, 'Kill fish'),
          h('button', { onclick: () => void this.copyReport() }, 'Copy run report'),
        ),
        h('div', { id: 'dbg-traits' }),
      );
    }
    const now = performance.now();
    if (now - this.debugLast < 250) return;
    this.debugLast = now;
    const w = this.world;
    const stats = $('dbg-stats');
    stats.textContent = `fps ${this.fps.toFixed(0)} · draw calls ${this.renderer.drawCalls} · graphics ${this.graphics.describe()}${w ? ` · ${w.stageId} t=${w.stageTime.toFixed(1)} · ${w.status}` : ''}`;
    const traits = $('dbg-traits');
    if (w && traits.dataset.fish !== w.fish.id) {
      traits.dataset.fish = w.fish.id;
      traits.replaceChildren(
        h('div', {}, 'Trait editor (z-scores)'),
        ...TRAIT_IDS.map((t) => {
          const input = h('input', { type: 'number', step: '0.25', value: w.fish.z[t].toFixed(2) });
          input.addEventListener('change', () => (w.fish.z[t] = Number(input.value)));
          return h('label', {}, t, input);
        }),
      );
    }
  }

  private debugJump(i: number): void {
    const w = this.world;
    if (!w) return;
    w.debugJumpTo(i);
    this.pending = w.drainEvents();
    this.showStageCard(w);
  }

  private async copyReport(): Promise<void> {
    const w = this.world;
    const report = JSON.stringify({ build: import.meta.env.MODE, fps: Math.round(this.fps), drawCalls: this.renderer.drawCalls, graphics: this.graphics.describe(), run: w?.summary(), generation: this.lineage?.generation }, null, 2);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      console.log(report);
    }
  }
}

const NAME_POOL: readonly string[] = NAMES;

function stat(label: string, value: string): HTMLElement {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

function alertBox(app: App, message: string, back: () => void): void {
  void app;
  show($('screen'), h('div', { class: 'panel' }, h('p', {}, message), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: back }, 'OK'))));
}

export type { StageId };

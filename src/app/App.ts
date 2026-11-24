/**
 * The game shell's coordinator: the app state, mode changes, the fixed-step
 * loop, saving, and the flow from one life to the next. Each screen lives in
 * src/app/screens/ (one module per screen, each with a `show…` function);
 * captions, flashes, journal toasts and the Field guide go out through
 * `messages` (src/app/messages.ts). The simulation lives in src/sim; drawing in src/render.
 */
// Photo mode (src/ui/photoMode.ts, src/render/photoRig.ts): openPhoto / closePhoto below.
import { PhotoMode } from '../ui/photoMode';
import { AudioEngine } from '../audio/engine';
import type { Phase } from '../audio/mood';
import paramFile from '../data/params.json';
import { Input } from '../input/input';
import { Renderer } from '../render/Renderer';
import { Graphics, isQualitySetting, quality } from '../render/quality';
import { detectSoftwareGL } from '../render/qualityRender';
import { foundFromStray, foundLineage, siblingsFor, type FoundOptions, type LifeRecord, type Lineage } from '../sim/lineage';
import { Params, type Difficulty, type ParamFile } from '../sim/params';
import type { FishIdentity, SimEvent, StageId } from '../sim/types';
import { World } from '../sim/world';
import { addToArchive, clearSave, readSave, requestPersistence, writeSave, type LifeSave, type SaveFile } from '../save/save';
import { $ } from '../ui/dom';
// Menus: arrow keys / D-pad move focus, Enter / A choose, Esc / B go back one level (src/ui/menuNav.ts).
import { MenuNav } from '../ui/menuNav';
import { hasRecording, loadNarration, onSpeaking, recordingUrl } from '../ui/narration';
import { caption } from '../ui/text';
// Field journal and guided first life: see the section of the same name below.
import { FieldJournal } from '../ui/journal';
import { applyAccess, gameSpeed } from '../ui/accessibility';
import { DebugPanel } from './debugPanel';
// Play log (opt-in, local only): src/telemetry/playLog.ts; one hook in handleEvents, a tab in screens/settings.ts.
import { PlayLog } from '../telemetry/playLog';
import { access } from '../ui/accessibility';
import { Messages, screenId } from './messages';
import { buildSave } from './saving';
import { loadSettings, QUALITY_URL_PARAM, saveSettings } from './settings';
import { onDeath, showDeath } from './screens/death';
import { onLifeComplete, showOffspringChoice } from './screens/endOfLife';
import { openJournal } from './screens/journal';
import { applySound, refreshGraphicsControls } from './screens/options';
import { showPauseMenu } from './screens/pause';
import { PlayHud } from './screens/play';
import { hideScreen } from './screens/screen';
import { showStageCard } from './screens/stageCard';
import { showTitle } from './screens/title';
import { weatherSound } from './weatherSound';

const FILE = paramFile as ParamFile;

type Mode = 'menu' | 'playing' | 'paused' | 'photo';

export class App {
  readonly renderer: Renderer;
  /** Graphics quality: the player's preset, and Auto stepping down on slow machines. */
  readonly graphics: Graphics;
  readonly input: Input;
  readonly audio = new AudioEngine({ has: hasRecording, url: recordingUrl });
  /** Captions, edge flashes, journal toasts and the Field guide: all on-screen messages go out through here. */
  readonly messages = new Messages();
  params: Params = new Params(FILE, 'fieldGuide');
  mode: Mode = 'menu';
  lineage: Lineage | null = null;
  world: World | null = null;
  archive: Lineage[] = [];
  settings = loadSettings();
  hudDetailed = false;
  /** Fish of this life who died so far (screens/death.ts, screens/endOfLife.ts). */
  deaths: LifeRecord['deaths'] = [];
  /** Offspring on offer at the end of a life, until one is chosen. Saved, so a reload reopens the choice. */
  pendingKids: FishIdentity[] | null = null;
  /** Years this life's fish spent in the lake, once it has left (route map, saved with the life); null before. */
  lakeYears: number | null = null;
  private lifeSeed = 1;
  private acc = 0;
  private last = performance.now();
  /** Smoothed frames per second (the debug panel shows it). */
  fps = 0;
  /** The HUD while playing (screens/play.ts). */
  private readonly playHud = new PlayHud();
  /** On the title screen (or setting up a new lineage from it). */
  atTitle = true;
  /** In the end-of-life sequence and recap. */
  ending = false;
  readonly debug = new URLSearchParams(location.search).has('debug');
  private readonly debugPanel = new DebugPanel(this);
  readonly playLog = new PlayLog(() => ({ graphics: this.graphics.describe(), gameSpeed: gameSpeed(), guidance: !!this.world && this.guided(this.world), gore: this.settings.gore, cinematics: access().cinematics, reducedMotion: access().reducedMotion }));

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Quality first: the WebGL context's antialiasing is fixed when it is made.
    // ?quality=low|medium|high|auto overrides the saved setting for this load (review screenshots).
    const urlQuality = new URLSearchParams(location.search).get(QUALITY_URL_PARAM);
    this.graphics = new Graphics(isQualitySetting(urlQuality) ? urlQuality : this.settings.quality, detectSoftwareGL() ? 'low' : 'high');
    this.renderer = new Renderer(canvas);
    this.renderer.applyQuality(quality, false);
    this.graphics.onChange = (q, change) => {
      this.renderer.applyQuality(q, change.rebuild);
      refreshGraphicsControls(this.graphics);
    };
    this.input = new Input(canvas);
    this.photo = new PhotoMode({ renderer: this.renderer, stageId: () => this.world?.stageId ?? 'photo', leave: () => this.closePhoto() });
    this.input.onKey = (code) => this.onKey(code);
    this.menuNav = new MenuNav($('screen'), () => this.mode === 'menu' || this.mode === 'paused');
    this.menuNav.onBack = () => this.menuBack();
    this.renderer.gore.mode = this.settings.gore;
    canvas.addEventListener('click', () => {
      if (this.mode === 'playing') this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'playing' && this.world?.status === 'playing' && this.wasLocked) this.pause();
      this.wasLocked = !!document.pointerLockElement;
      // Text diet: the first time the mouse takes over steering, a note says how to get the pointer back.
      if (document.pointerLockElement && this.mode === 'playing') this.messages.pointerLocked();
    });
    this.messages.guided = () => !!this.world && this.guided(this.world);
    window.addEventListener('resize', () => this.resize());
    // Browsers only allow sound after a user gesture: start it on the first one.
    const unlock = () => this.audio.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', (e) => e.key !== 'Escape' && unlock(), true);
    onSpeaking((on) => this.audio.setDucked(on));
    applySound(this);
    applyAccess();
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  private wasLocked = false;
  readonly menuNav: MenuNav;
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
    this.messages.frame(frameDt * 1000, !!w && this.mode === 'playing' && w.status === 'playing');
    if (this.mode === 'photo') this.photo.frame(frameDt);
    if (w) {
      this.renderer.cinematics.running = this.mode === 'playing'; // cinematic shots hold while paused
      this.renderer.render(w, frameDt);
      this.playHud.feelHits(this, w);
      this.playHud.update(this, w, frameDt);
    }
    this.audio.update(frameDt, w, this.audioPhase());
    // Rain and wind for the sound (a stub for the sound work; weatherSound.ts).
    if (w) weatherSound(this.audio, this.renderer.weather);
    // Paused: the scene dims and captions, toasts and the guide hide behind the menu (styles.css).
    document.body.classList.toggle('paused', this.mode === 'paused');
    if (this.debug) this.debugPanel.update();
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
    this.messages.setStage(this.world?.stageId ?? null);
    this.audio.onEvents(events);
    this.renderer.gore.onEvents(events, this.world);
    this.renderer.cinematics.onEvents(events, this.world);
    this.journalAndGuideEvents(events);
    this.playLog.observe(this.world, events, this.renderer.gore.tracker.hits);
    for (const ev of events) {
      if (ev.type === 'caption' || ev.type === 'reveal' || ev.type === 'spawned') {
        if (ev.key) {
          if (ev.key === 'fry.leave' || ev.key === 'fry.leaveSecond') this.lakeYears = ev.key === 'fry.leave' ? 1 : 2;
          this.messages.caption(ev.key, ev.vars);
          this.lastCaption = caption(screenId(ev.key), ev.vars);
        }
      } else if (ev.type === 'warning') {
        this.messages.flash(ev.key === 'opening' ? 'opening' : 'on');
      } else if (ev.type === 'checkpoint') {
        // Mid-stage checkpoints (fry winter, second summer, home river) are kept on disk too.
        void this.save();
      }
    }
  }

  private lastHandledStatus = '';
  private lastCaption: string | null = null;
  /** Events from a stage's start, shown once the player presses Begin/Continue. */
  pending: SimEvent[] = [];

  /** Hand a finished stage, a death or a finished life to its screen (once per status). */
  afterStatus(w: World): void {
    // Which fish is part of the key: a sibling resumes at the same checkpoint time, so two deaths there
    // before a frame has run would otherwise look like one and the second would never be handled.
    const key = `${w.status}:${w.stageIndex}:${w.time.toFixed(3)}:${w.siblingsLeft}:${w.fish.name}`;
    if (w.status === 'playing' || this.lastHandledStatus === key) return;
    this.lastHandledStatus = key;
    if (w.status === 'stageComplete') this.onStageComplete(w);
    else if (w.status === 'dead') onDeath(this, w);
    else if (w.status === 'lifeComplete') void onLifeComplete(this, w);
  }

  private onKey(code: string): void {
    if (this.mode === 'photo') return this.photoKey(code);
    if (code === 'KeyP' && this.mode === 'playing') return this.openPhoto();
    if (this.journalKey(code)) return;
    if (code === 'Escape' && this.mode === 'playing') this.pause();
    else if (code === 'Escape') this.menuBack();
    else if (code === 'KeyV') this.toggleView();
    else if (code === 'KeyH') this.hudDetailed = !this.hudDetailed;
    else if (code === 'KeyM') this.toggleMute();
  }

  /** Esc or the pad's B in a menu: back one level (the pause menu's Back is Resume). */
  private menuBack(): void {
    if (this.journalBack) return this.journalBack();
    if (!this.menuNav.back() && this.mode === 'paused') this.resume();
  }

  /** Third-person or first-person camera. */
  toggleView(): void {
    this.renderer.cycleView();
  }

  setHudVisible(visible: boolean): void {
    $('hud').hidden = !visible;
  }

  // ---------- Sound ----------

  private audioPhase(): Phase {
    if (this.ending) return 'end';
    if (this.atTitle) return 'title';
    return this.mode === 'playing' ? 'playing' : this.mode === 'paused' || this.mode === 'photo' ? 'paused' : 'menu';
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    saveSettings(this.settings);
    applySound(this);
  }

  // ---------- Life to life ----------

  showTitle(save: SaveFile | null): void {
    showTitle(this, save);
  }

  setDifficulty(d: Difficulty): void {
    this.params = new Params(FILE, d);
  }

  /** Found a new lineage (setup screen) and start its first life. */
  foundLineage(opts: FoundOptions): void {
    this.setDifficulty(opts.difficulty);
    this.retireLineage();
    this.lineage = foundLineage(this.params, opts);
    this.deaths = [];
    this.pendingKids = null;
    this.startLife(null);
  }

  /** A stray carries on an extinct line in the same river. */
  foundFromStray(l: Lineage, seed: number, name: string): void {
    this.lineage = foundFromStray(this.params, l, seed, name);
    this.deaths = [];
    this.pendingKids = null;
    this.startLife(null);
  }

  continueSave(save: SaveFile): void {
    this.lineage = save.lineage;
    this.archive = save.archive ?? [];
    this.params = new Params(FILE, save.lineage.difficulty);
    this.deaths = save.life?.deaths ?? [];
    this.pendingKids = save.life ? null : (save.pendingOffspring ?? null);
    const last = save.lineage.records.at(-1);
    if (this.pendingKids?.length && last) {
      this.atTitle = false;
      showOffspringChoice(this, last, this.pendingKids);
      return;
    }
    this.pendingKids = null;
    this.startLife(save.life);
  }

  startLife(resume: LifeSave | null): void {
    const l = this.lineage;
    if (!l) return;
    this.atTitle = false;
    this.ending = false;
    this.lifeSeed = resume?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.lakeYears = resume?.lakeYears ?? null;
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
        showDeath(this, w);
        return;
      }
    }
    this.world = w;
    this.messages.newLife();
    this.pending = w.drainEvents();
    void this.save();
    showStageCard(this, w);
  }

  /** Begin or continue the stage on the card. */
  play(): void {
    const w = this.world;
    if (!w) return;
    this.audio.unlock();
    hideScreen();
    this.setHudVisible(true);
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
    showPauseMenu(this);
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    hideScreen();
    this.mode = 'playing';
    this.input.clear();
    this.last = performance.now();
    if (this.world?.stageId !== 'egg') this.input.requestLock();
  }

  private onStageComplete(w: World): void {
    this.input.releaseLock();
    const note = this.lastCaption;
    const advanced = w.advance();
    if (!advanced) return;
    this.pending = w.drainEvents();
    void this.save();
    showStageCard(this, w, note);
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
    hideScreen();
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
    if (this.mode === 'paused') return showPauseMenu(this);
    this.last = performance.now();
    if (this.world?.stageId !== 'egg') this.input.requestLock();
  }

  private photoKey(code: string): void {
    if (code === 'Escape' || code === 'KeyP') this.closePhoto();
    else if (code === 'KeyH') this.photo.toggleUi();
    else if (code === 'KeyM') this.toggleMute();
  }

  // ---------- Field journal and guided first life ----------
  // Journal unlocks are kept per browser (src/ui/journal.ts), not in the save.
  // The guide shows step-by-step objectives in a Field guide first life (src/ui/tutorial.ts, through messages).

  readonly journal = new FieldJournal();
  /** While the journal page is open: closes it and reopens the screen it came from. */
  journalBack: (() => void) | null = null;

  private get lifeKey(): string {
    return this.lineage ? `${this.lineage.id}:${this.lineage.generation}` : '';
  }

  /** A Field guide first life whose guidance hasn't been skipped. */
  guided(w: World): boolean {
    return access().guidance && w.firstLife && this.lineage?.difficulty === 'fieldGuide' && !this.messages.guide.isSkipped(this.lifeKey);
  }

  private journalAndGuideEvents(events: SimEvent[]): void {
    const w = this.world;
    this.messages.toast(this.journal.recordEvents(events, { habitat: w?.fish.habitat }));
    if (w) this.messages.guideEvents(w, events);
  }

  /** Unlock journal entries by trigger key (and show their toast). */
  noteJournal(triggers: string[]): void {
    this.messages.toast(this.journal.record(triggers));
  }

  skipGuide(): void {
    if (this.world && this.guided(this.world)) this.messages.guide.skip(this.lifeKey);
  }

  /** J opens the journal while paused, Esc closes it, G skips guidance. Returns true if handled. */
  private journalKey(code: string): boolean {
    if (code === 'Escape' && this.journalBack) this.journalBack();
    else if (code === 'KeyJ' && this.mode === 'paused' && !this.journalBack) openJournal(this, () => showPauseMenu(this));
    else if (code === 'KeyJ' && this.mode === 'playing' && this.world?.status === 'playing') {
      // From play (the journal chip names this key): pause, and Back returns to the pause menu.
      this.pause();
      openJournal(this, () => showPauseMenu(this));
    }
    else if (code === 'KeyG' && this.mode === 'playing') this.skipGuide();
    else return false;
    return true;
  }

  // ---------- Lineage depth ----------
  // The drawn tree, records, extinction screen and Lineages page live in src/ui/lineageView.ts.

  /** The save shown on the title screen, so a new lineage can archive the one it replaces. */
  titleSave: SaveFile | null = null;

  /** Keep the line being replaced (if it got anywhere) in the archive for the Lineages page. */
  private retireLineage(): void {
    const old = this.lineage ?? this.titleSave?.lineage ?? null;
    if (old && old.records.length) this.archive = addToArchive(this.archive, old);
  }

  // ---------- Saving ----------

  currentSave(): SaveFile | null {
    return buildSave({ lineage: this.lineage, world: this.world, lifeSeed: this.lifeSeed, deaths: this.deaths, pendingKids: this.pendingKids, archive: this.archive, lakeYears: this.lakeYears });
  }

  async save(): Promise<void> {
    const s = this.currentSave();
    if (s) await writeSave(s);
  }

  async newGameReset(): Promise<void> {
    await clearSave();
  }

  // ---------- Playtest tools ----------

  /** Jump to stage i (debug panel, tests and screenshot scripts). */
  debugJump(i: number): void {
    const w = this.world;
    if (!w) return;
    w.debugJumpTo(i);
    this.pending = w.drainEvents();
    showStageCard(this, w);
  }
}

export type { StageId };

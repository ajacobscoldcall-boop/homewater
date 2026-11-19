/**
 * The game shell: screens, the fixed-step loop, saving, and the flow from
 * one life to the next. The simulation lives in src/sim; drawing in src/render.
 */
import paramFile from '../data/params.json';
import { Input } from '../input/input';
import { Renderer } from '../render/Renderer';
import {
  advanceGeneration,
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
import { Params, type Difficulty, type ParamFile } from '../sim/params';
import { alevinView } from '../sim/stages/egg';
import { fryGrowth } from '../sim/stages/fry';
import { TRAIT_IDS, type FishIdentity, type SimEvent, type Sex, type StageId, type TraitValues } from '../sim/types';
import { World } from '../sim/world';
import { clearSave, exportSave, importSave, readSave, requestPersistence, writeSave, SCHEMA_VERSION, type LifeSave, type SaveFile } from '../save/save';
import { $, h, show } from '../ui/dom';
import { loadNarration, narrate } from '../ui/narration';
import { caption, DEATH_TITLES, OBJECTIVES, sexSymbol, STAGE_TITLES, stageCardLine, traitLines, yearLine } from '../ui/text';

const FILE = paramFile as ParamFile;

type Mode = 'menu' | 'playing' | 'paused';

interface Settings {
  gore: 'unflinching' | 'documentary';
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('homewater.settings') ?? '{}') as Partial<Settings>;
    return { gore: s.gore === 'documentary' ? 'documentary' : 'unflinching' };
  } catch {
    return { gore: 'unflinching' };
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
  readonly input: Input;
  params: Params = new Params(FILE, 'fieldGuide');
  mode: Mode = 'menu';
  lineage: Lineage | null = null;
  world: World | null = null;
  archive: Lineage[] = [];
  settings = loadSettings();
  hudDetailed = false;
  private deaths: LifeRecord['deaths'] = [];
  private lifeSeed = 1;
  private acc = 0;
  private last = performance.now();
  private fps = 0;
  private captionEls: HTMLElement[] = [];
  private flashTimer = 0;
  readonly debug = new URLSearchParams(location.search).has('debug');

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.input.onKey = (code) => this.onKey(code);
    canvas.addEventListener('click', () => {
      if (this.mode === 'playing') this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'playing' && this.world?.status === 'playing' && this.wasLocked) this.pause();
      this.wasLocked = !!document.pointerLockElement;
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  private wasLocked = false;

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
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= w.dt && steps < 8) {
        w.step(this.input.consume());
        this.acc -= w.dt;
        steps++;
        if (w.status !== 'playing') break;
      }
      this.handleEvents(w.drainEvents());
      this.afterStatus(w);
    } else {
      this.acc = 0;
    }
    if (w) {
      this.renderer.render(w, frameDt);
      this.updateHud(w, frameDt);
    }
    if (this.debug) this.updateDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Advance the simulation by n steps (tests and playtest tools). */
  stepSim(n: number): void {
    const w = this.world;
    if (!w) return;
    for (let i = 0; i < n && w.status === 'playing'; i++) w.step(this.input.consume());
    this.handleEvents(w.drainEvents());
    this.afterStatus(w);
  }

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'caption' || ev.type === 'reveal' || ev.type === 'spawned') {
        if (ev.key) {
          this.showCaption(ev.key, ev.vars, false);
          this.lastCaption = caption(ev.key, ev.vars);
        }
      } else if (ev.type === 'warning') {
        this.flash(ev.key === 'opening' ? 'opening' : 'on');
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
    const f = w.fish;
    const sibs = '◆'.repeat(Math.max(0, w.siblingsLeft));
    $('hud-who').innerHTML = '';
    $('hud-who').append(
      h('b', {}, f.name),
      ` · ${sexSymbol(f.sex)} · generation ${f.generation} · ${STAGE_TITLES[w.stageId]}`,
      h('br'),
      `siblings ${sibs || 'none'}`,
    );
    const guided = w.firstLife && this.lineage?.difficulty === 'fieldGuide';
    $('hud-objective').textContent = guided || this.hudDetailed ? OBJECTIVES[w.stageId] : '';
    $('hud-hint').textContent = this.mode === 'playing' ? (this.input.locked ? 'V view · H details · Esc pause' : 'Click to steer with the mouse · V view · H details · Esc pause') : '';

    // Immersive state: the edges darken as the fish weakens.
    const alevin = alevinView(w);
    const fat = w.stageId === 'return' ? w.progress.fat : 1;
    const danger = alevin ? Math.max(alevin.exposure, alevin.drift) : 0;
    const weakness = Math.max(1 - w.body.energy, danger, 1 - fat * 2.2);
    $('vignette').style.opacity = String(Math.max(0, Math.min(0.95, (weakness - 0.35) * 1.4)));

    this.updateThreats(w);

    const bars = $('hud-bars');
    bars.hidden = !this.hudDetailed;
    if (this.hudDetailed) {
      const rows: [string, number][] = [];
      if (alevin) rows.push(['yolk', w.progress.yolk], ['hold', 1 - alevin.drift], ['hidden', 1 - alevin.exposure], ['daylight', alevin.light]);
      else rows.push(['energy', w.body.energy]);
      if (w.stageId === 'fry') rows.push(['growth', fryGrowth(w)]);
      if (w.stageId === 'return') rows.push(['fat', w.progress.fat]);
      if (!alevin) rows.push(['depth', Math.min(1, (w.arena.surfaceY - w.body.pos.y) / 8)]);
      bars.replaceChildren(
        ...rows.map(([name, v]) => h('div', { class: `bar${v < 0.25 && name !== 'depth' && name !== 'daylight' ? ' low' : ''}` }, name, h('i', {}, h('b', { style: `width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` })))),
      );
    }
  }

  /** Markers on threats that are warning or attacking; arrows at the edge for ones off screen. */
  private updateThreats(w: World): void {
    const layer = $('threats');
    if (this.mode !== 'playing' || w.status !== 'playing') {
      layer.replaceChildren();
      return;
    }
    const LABEL: Partial<Record<string, string>> = { shark: 'shark', trout: w.stageId === 'fry' ? 'dolly varden' : 'char', birdShadow: 'bird', merganser: 'merganser', seal: 'seal', orca: 'orca', bear: 'bear', rival: 'rival' };
    const HOT = new Set(['chase', 'strike', 'lunge', 'charge', 'dive']);
    const WARN = new Set(['warn', ...HOT]);
    const items: { x: number; y: number; label: string; hot: boolean; opening?: boolean; off: boolean; angle: number }[] = [];
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
    const els = items.slice(0, 8).map((t) => {
      const el = h('div', { class: `threat${t.hot ? ' hot' : ''}${t.opening ? ' opening' : ''}`, style: `left:${(t.x * 100).toFixed(1)}%;top:${(t.y * 100).toFixed(1)}%` });
      if (t.off) el.append(h('div', { class: 'arrow', style: `transform:rotate(${(t.angle + Math.PI / 2).toFixed(2)}rad)` }));
      else el.append(h('div', { class: 'ring' }));
      el.append(h('span', {}, t.label));
      return el;
    });
    layer.replaceChildren(...els);
  }

  private onKey(code: string): void {
    if (code === 'Escape' && this.mode === 'playing') this.pause();
    else if (code === 'Escape' && this.mode === 'paused') this.resume();
    else if (code === 'KeyV') this.renderer.cameraMode = this.renderer.cameraMode === 'third' ? 'first' : 'third';
    else if (code === 'KeyH') this.hudDetailed = !this.hudDetailed;
  }

  // ---------- Screens ----------

  private screen(...nodes: Node[]): void {
    show($('screen'), ...nodes);
  }

  private clearScreen(): void {
    $('screen').replaceChildren();
  }

  showTitle(save: SaveFile | null): void {
    this.mode = 'menu';
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
        await writeSave(s);
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
          'Content warning: this game shows predation, deaths from fishing, and decay. Milestone 1 is a grey-box prototype, so none of it is graphic yet.',
        ),
        save && !save.lineage.extinct
          ? h(
              'div',
              { class: 'row' },
              h('button', { class: 'primary', id: 'btn-continue', onclick: () => this.continueSave(save) }, `Continue: ${save.lineage.current.name}, generation ${save.lineage.generation}`),
              h('button', { id: 'btn-new', onclick: () => this.showSetup() }, 'New lineage'),
            )
          : h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-new', onclick: () => this.showSetup() }, 'New lineage')),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => fileInput.click() }, 'Import lineage file'),
          save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
          fileInput,
        ),
        h('p', { class: 'label' }, 'Gore'),
        h('div', { class: 'grid3' }, goreBtn('unflinching', 'Unflinching', 'Predation and decay shown plainly.'), goreBtn('documentary', 'Documentary', 'Deaths cut away before the worst of it.')),
        h('p', { class: 'muted' }, 'Prototype build. Saves stay in this browser; export your lineage to keep it safe.'),
      ),
    );
  }

  private showSetup(): void {
    let preset: StartPreset = 'quick';
    let sex: Sex = 'F';
    let difficulty: Difficulty = 'fieldGuide';
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
                    const opts = { preset, sex: preset === 'jack' ? ('M' as Sex) : sex, name, difficulty, seed, ...(preset === 'custom' ? { custom } : {}) };
                    this.lineage = foundLineage(this.params, opts);
                    this.deaths = [];
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
    this.startLife(save.life);
  }

  private startLife(resume: LifeSave | null): void {
    const l = this.lineage;
    if (!l) return;
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
      w.restore(resume.checkpoint);
      w.siblingsLeft = resume.siblingsLeft;
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
        h('p', { class: 'muted' }, OBJECTIVES[w.stageId]),
        h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-play', onclick: () => this.play() }, w.stageIndex === 0 ? 'Begin' : 'Continue')),
      ),
    );
  }

  private play(): void {
    const w = this.world;
    if (!w) return;
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
    const save = this.currentSave();
    this.screen(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Paused'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.resume() }, 'Resume'),
          h('button', { onclick: () => (this.renderer.cameraMode = this.renderer.cameraMode === 'third' ? 'first' : 'third') }, 'Switch view (V)'),
          h('button', { onclick: () => (this.hudDetailed = !this.hudDetailed) }, 'Detailed HUD (H)'),
          save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
          h('button', { onclick: () => void this.save().then(() => readSave()).then((s) => this.showTitle(s)) }, 'Save and quit to title'),
        ),
        h('p', { class: 'muted' }, 'W swim · S hold against the current · A/D or mouse steer · Space/C rise/dive · Shift burst · E act · V view · H details'),
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
    const cause = w.deathCause ?? 'exhaustion';
    this.deaths.push({ name: w.fish.name, stage: w.stageId, cause });
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
      this.archive = [l, ...this.archive].slice(0, 10);
      void this.save();
      this.screen(
        h(
          'div',
          { class: 'panel' },
          h('h2', {}, 'The line ends'),
          h('p', {}, science),
          h('p', {}, `The ${l.current.name} line lasted ${l.generation} generation${l.generation === 1 ? '' : 's'}.`),
          this.familyTree(l),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => void readSave().then((s) => this.showTitle(s)) }, 'Back to title')),
        ),
      );
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
    };
  }

  private async onLifeComplete(w: World): Promise<void> {
    this.mode = 'menu';
    this.input.releaseLock();
    $('hud').hidden = true;
    const l = this.lineage;
    if (!l) return;
    for (const id of ['end.decay', 'end.forest', 'end.hatch']) {
      this.screen(h('p', { class: 'fade-line', 'data-caption-id': id }, caption(id) ?? ''));
      narrate(id);
      await sleep(this.debug || navigator.webdriver ? 300 : 2600);
    }
    const rec = this.lifeRecord(w, true);
    recordLife(l, rec);
    this.deaths = [];
    const parent = w.fish;
    const kids = offerOffspring(this.params, l, parent);
    const r = w.spawnResult;
    void this.save();
    const role = parent.sex === 'F' ? 'eggs laid' : 'eggs fertilized';
    this.screen(
      h(
        'div',
        { class: 'panel wide' },
        h('p', { class: 'label' }, `Generation ${parent.generation} · ${parent.name}`),
        h('h2', {}, `${r ? r.relativeFitness.toFixed(2) : '0'}× an average spawner`),
        h(
          'dl',
          { class: 'stats' },
          stat(role, r ? r.eggs.toLocaleString() : '0'),
          stat('Life history', parent.sex === 'F' ? `${w.progress.oceanYears ?? '?'} years at sea` : w.progress.isJack ? 'Jack, 1 year at sea' : `Large male, ${w.progress.oceanYears ?? '?'} years at sea`),
          stat('Siblings lost', String(rec.deaths.length)),
          stat('Notes', r?.detail ?? ''),
        ),
        h('p', { class: 'muted' }, yearLine(w.conditions)),
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
        this.familyTree(l),
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
        this.startLife(null);
      },
      h('p', {}, `${sexSymbol(kid.sex)}. ${traitLines(kid).join(' · ')}`),
    );
  }

  private familyTree(l: Lineage): HTMLElement {
    const rows = [...l.records].reverse().map((r) => {
      const fate = r.spawned && r.result ? `spawned · ${r.result.eggs.toLocaleString()} eggs · ${r.result.relativeFitness.toFixed(2)}×` : `no spawn · ${r.deaths.at(-1)?.cause ?? ''}`;
      const kind = r.sex === 'M' ? (r.isJack ? 'jack' : 'male') : 'female';
      return h('div', {}, `Gen ${r.generation} · ${r.name} (${kind}${r.isStray ? ', stray' : ''}) · ${fate}${r.deaths.length ? ` · ${r.deaths.length} sibling${r.deaths.length === 1 ? '' : 's'} lost` : ''}`);
    });
    return h('div', { class: 'tree', id: 'family-tree' }, ...(rows.length ? rows : [h('div', {}, 'No completed lives yet.')]));
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
    return { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), game: 'homewater', lineage: l, life, archive: this.archive };
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
    stats.textContent = `fps ${this.fps.toFixed(0)} · draw calls ${this.renderer.drawCalls}${w ? ` · ${w.stageId} t=${w.stageTime.toFixed(1)} · ${w.status}` : ''}`;
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
    const report = JSON.stringify({ build: import.meta.env.MODE, fps: Math.round(this.fps), drawCalls: this.renderer.drawCalls, run: w?.summary(), generation: this.lineage?.generation }, null, 2);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function alertBox(app: App, message: string, back: () => void): void {
  void app;
  show($('screen'), h('div', { class: 'panel' }, h('p', {}, message), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: back }, 'OK'))));
}

export type { StageId };

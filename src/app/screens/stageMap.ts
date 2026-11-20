/** The life route map on each stage card: how far this life has come, the years so far, and where the brood has lost fish. */
import type { World } from '../../sim/world';
import { h } from '../../ui/dom';
import { mapFromLife } from '../../ui/lifeMap';
import { lifeMap } from '../../ui/lifeMapView';
import type { App } from '../App';

export function stageCardMap(app: App, w: World): HTMLElement {
  return h('div', { class: 'stage-card-map' }, lifeMap(mapFromLife(w, app.deaths, app.lakeYears), { id: 'stage-map' }));
}

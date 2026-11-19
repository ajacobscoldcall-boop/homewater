import './ui/styles.css';
import { App } from './app/App';
import { installDebugHandle } from './debug/debug';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const GALLERY = 'gallery';

if (params.has(GALLERY)) {
  // Model gallery for review screenshots; loaded on demand, never part of normal play.
  void import('./render/gallery').then((m) => m.startGallery(canvas, params.get(GALLERY) ?? '1', params));
} else {
  const app = new App(canvas);
  installDebugHandle(app);
  void app.boot();
}

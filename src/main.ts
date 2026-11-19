import './ui/styles.css';
import { App } from './app/App';
import { installDebugHandle } from './debug/debug';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const app = new App(canvas);
installDebugHandle(app);
void app.boot();

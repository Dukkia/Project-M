const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { GlobalKeyboardListener } = require('node-global-key-listener');

let mainWindow;
const vKey = new GlobalKeyboardListener();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 885,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "M-Controller Pro (Global Hook)",
    backgroundColor: "#0f172a"
  });

  const isDev = !app.isPackaged;
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, './dist/index.html')}`);
  mainWindow.removeMenu();
}

app.whenReady().then(() => {
  createWindow();

  // --- IPC for File Persistence ---
  ipcMain.on('save-data', (event, data) => {
    try {
      const p = path.join(__dirname, 'profiles.json');
      fs.writeFileSync(p, JSON.stringify(data, null, 2));
      console.log('Saved data to:', p);
    } catch (e) {
      console.error('IPC Save Error:', e);
    }
  });

  ipcMain.handle('load-data', async () => {
    try {
      const p = path.join(__dirname, 'profiles.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error('IPC Load Error:', e);
    }
    return null;
  });

  ipcMain.handle('get-pixel-color', async (event, { x, y, sourceId }) => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { width: 1920, height: 1080 } 
      });
      let source = sources[0];
      if (sourceId) {
        const found = sources.find(s => s.id === sourceId);
        if (found) source = found;
      }
      
      if (source) {
        const img = source.thumbnail;
        const size = img.getSize();
        const tx = Math.min(Math.max(0, Math.round(x)), size.width - 1);
        const ty = Math.min(Math.max(0, Math.round(y)), size.height - 1);

        // Workaround for getPixelColor potentially being missing/failing
        const bitmap = img.toBitmap();
        const pos = (ty * size.width + tx) * 4;
        const b = bitmap[pos];
        const g = bitmap[pos + 1];
        const r = bitmap[pos + 2];
        const hex = "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        return hex;
      }
    } catch (e) {
      console.error('Pixel Capture Error:', e);
    }
    return '#000000';
  });

  ipcMain.handle('get-screenshot', async () => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { width: 1920, height: 1080 } 
      });
      const primarySource = sources[0];
      if (primarySource) {
        return primarySource.thumbnail.toDataURL();
      }
    } catch (e) {
      console.error('Screenshot Error:', e);
    }
    return null;
  });

  ipcMain.handle('get-area-pixel-search', async (event, { x, y, w, h, hex }) => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { width: 1920, height: 1080 } 
      });
      const primarySource = sources[0];
      if (primarySource) {
        const img = primarySource.thumbnail;
        const size = img.getSize();
        const bitmap = img.toBitmap();

        const startX = Math.min(Math.max(0, Math.round(x)), size.width - 1);
        const startY = Math.min(Math.max(0, Math.round(y)), size.height - 1);
        const endX = Math.min(startX + w, size.width - 1);
        const endY = Math.min(startY + h, size.height - 1);

        const target = hex.replace("#", "").toUpperCase();
        const tr = parseInt(target.substring(0, 2), 16);
        const tg = parseInt(target.substring(2, 4), 16);
        const tb = parseInt(target.substring(4, 6), 16);
        
        // Scan area
        for (let iy = startY; iy <= endY; iy++) {
          for (let ix = startX; ix <= endX; ix++) {
            const pos = (iy * size.width + ix) * 4;
            // NativeImage.toBitmap() usually returns BGRA
            if (bitmap[pos + 2] === tr && bitmap[pos + 1] === tg && bitmap[pos] === tb) {
              return true;
            }
          }
        }
      }
    } catch (e) {
      console.error('Area Search error:', e);
    }
    return false;
  });

  ipcMain.handle('get-screen-list', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      return sources.map(s => ({ id: s.id, name: s.name }));
    } catch (e) {
      console.error('Screen List Error:', e);
    }
    return [];
  });

  ipcMain.handle('get-main-source-id', async (event, preferredId) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (preferredId) {
        const found = sources.find(s => s.id === preferredId);
        if (found) return found.id;
      }
      return sources[0]?.id || null;
    } catch (e) {
      console.error('Source ID Error:', e);
    }
    return null;
  });

  // --- Keyboard Hook via node-global-key-listener ---
  vKey.addListener((e, down) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    // Send event only on DOWN/UP states (F9 / F10)
    if (e.name === 'F9' && e.state === 'DOWN') {
      mainWindow.webContents.send('global-keydown', { key: 'F9' });
      return;
    }
    if (e.name === 'F10' && e.state === 'DOWN') {
      mainWindow.webContents.send('global-keydown', { key: 'F10' });
      return;
    }

    if (e.state === 'DOWN') {
      mainWindow.webContents.send('global-keydown', { key: e.name });
    } else if (e.state === 'UP') {
      mainWindow.webContents.send('global-keyup', { key: e.name });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

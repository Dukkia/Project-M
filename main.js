const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');

// Disable WGC to avoid E_ACCESSDENIED in Admin mode. The error logs are cosmetic; GDI fallback works.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'WinrtScreenCapture,WinrtWindowCapture,WebRtcAllowWgcScreenCapture,WebRtcAllowWgcWindowCapture,DesktopCaptureWinWgc,MagnificationScreenCapture');
app.commandLine.appendSwitch('enable-features', 'GdiScreenCapture,DesktopCaptureWinGdi');
const path = require('path');
const fs = require('fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const axios = require('axios');

// Key mapping for Pico compatibility
const picoKeyMap = {
  'ARROWLEFT': 'LEFT',
  'ARROWRIGHT': 'RIGHT',
  'ARROWUP': 'UP',
  'ARROWDOWN': 'DOWN',
  'CTRL': 'CTRL',
  'CTRLRIGHT': 'CTRLRIGHT',
  'ALT': 'ALT',
  'ALTRIGHT': 'ALTRIGHT',
  'SHIFT': 'SHIFT',
  'SHIFTRIGHT': 'SHIFTRIGHT',
  'META': 'GUI',
  'METARIGHT': 'GUI',
  'ESCAPE': 'ESC',
  'SEMICOLON': ';',
  'EQUAL': '=',
  'COMMA': ',',
  'MINUS': '-',
  'PERIOD': '.',
  'SLASH': '/',
  'BACKQUOTE': '`',
  'BRACKETLEFT': '[',
  'BACKSLASH': '\\',
  'BRACKETRIGHT': ']',
  'QUOTE': "'"
};

const keyMap = {};
Object.keys(UiohookKey).forEach(name => {
  const upperName = name.toUpperCase();
  keyMap[UiohookKey[name]] = picoKeyMap[upperName] || upperName;
});

const activeKeys = new Set(); // To prevent event spam from OS repeats

let mainWindow;

// App creation begins inside app.whenReady() below...

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1225,
    height: 650,
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
  mainWindow.removeMenu(); // Disabled menu to hide dev tools
  // if (isDev) mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  // --- Web Serial API Handler ---
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    console.log('[시리얼 포트들 감지됨]:', portList.map(p => p.portId + ' (' + p.displayName + ')'));

    if (portList && portList.length > 0) {
      // 1. 유저 지정 최우선 탐색: Pico / CircuitPython (실제 피코 장치)
      const picoPort = portList.find(p => 
        (p.displayName && (p.displayName.includes('CircuitPython') || p.displayName.includes('Pico'))) ||
        (p.portId && (p.portId.includes('CircuitPython') || p.portId.includes('Pico')))
      );
      
      if (picoPort) {
        console.log('-> 피코 장치가 발견되어 우선 연결합니다:', picoPort.portId);
        callback(picoPort.portId);
        return;
      }

      // 2. 차선책: COM3 (기존 강제 연결 방식)
      const com3Port = portList.find(p => p.portId === 'COM3' || p.portName === 'COM3');
      if (com3Port) {
        console.log('-> COM3가 발견되어 강제 연결을 시도합니다.');
        callback(com3Port.portId);
        return;
      }

      // 3. USB 장치 (Pico, Arduino 등) 우선 탐색 (가상의 Bluetooth COM 포트 제외)
      const usbPort = portList.find(p => p.usbVendorId || p.vendorId || (p.displayName && p.displayName.toLowerCase().includes('usb')));
      if (usbPort) {
        console.log('-> USB 장치가 발견되어 연결을 시도합니다:', usbPort.portId);
        callback(usbPort.portId);
      } else {
        // 4. 없으면 가장 마지막 포트 반환
        console.log('-> USB 장치를 찾지 못해 마지막 포트를 연결합니다:', portList[portList.length - 1].portId);
        callback(portList[portList.length - 1].portId);
      }
    } else {
      console.log('-> 일치하는 포트가 없습니다.');
      callback(''); // Could not find any matching devices
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return true;
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(true);
  });

  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).then((sources) => {
      let source = sources[0];
      const targetId = global.requestedScreenId;
      if (targetId) {
        const found = sources.find(s => s.id === targetId);
        if (found) source = found;
      }
      callback({ video: source, audio: request.audioRequested ? 'loopback' : null });
    }).catch(err => {
      console.error('getSources Error:', err);
    });
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    return true;
  });

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
        thumbnailSize: { width: 1280, height: 720 } 
      });
      let source = sources[0];
      if (global.requestedScreenId) {
        const found = sources.find(s => s.id === global.requestedScreenId);
        if (found) source = found;
      }
      if (source) {
        // JPEG is ~10x faster than PNG for encoding/transfer
        const jpegBuf = source.thumbnail.toJPEG(70);
        return 'data:image/jpeg;base64,' + jpegBuf.toString('base64');
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
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      return sources.map(s => ({ id: s.id, name: s.name }));
    } catch (e) {
      console.error('Screen List Error:', e);
    }
    return [];
  });

  ipcMain.handle('get-main-source-id', async (event, preferredId) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      let id = sources[0]?.id || null;
      if (preferredId) {
        const found = sources.find(s => s.id === preferredId);
        if (found) id = found.id;
      }
      global.requestedScreenId = id;
      return id;
    } catch (e) {
      console.error('Source ID Error:', e);
    }
    return null;
  });

  // --- Pure JS Template Matching (Jimp, multi-scale, RGB with tolerance) ---
  ipcMain.handle('cv-match-template', async (event, { templateDataUrl, sourceDataUrl, srcScale }) => {
    try {
      const Jimp = require('jimp');
      const toBuffer = (dataUrl) => Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');

      const [srcJimp, tplJimpOrig] = await Promise.all([
        Jimp.read(toBuffer(sourceDataUrl)),
        Jimp.read(toBuffer(templateDataUrl)),
      ]);

      const srcW = srcJimp.bitmap.width;
      const srcH = srcJimp.bitmap.height;
      const srcData = srcJimp.bitmap.data; // RGBA flat buffer

      const COLOR_TOL = 40;
      // sc: size multiplier relative to template's "natural" size on source canvas
      // e.g. sc=1.0 → template appears at its original pixel size scaled to canvas
      const scaleSteps = [1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2];
      const origW = tplJimpOrig.bitmap.width;
      const origH = tplJimpOrig.bitmap.height;

      let bestSim = 0;
      let bestX = 0, bestY = 0, bestTW = 0, bestTH = 0;

      for (const sc of scaleSteps) {
        // Correct: srcScale maps orig px → canvas px, sc adds variation
        const tw = Math.round(origW * srcScale * sc);
        const th = Math.round(origH * srcScale * sc);
        if (tw > srcW || th > srcH || tw < 8 || th < 8) continue;

        const tplResized = await tplJimpOrig.clone().resize(tw, th);
        const tplData = tplResized.bitmap.data;

        // Build ~1200 evenly-sampled template pixels
        const step = Math.max(1, Math.round(Math.sqrt((tw * th) / 1200)));
        const samples = [];
        for (let ty = 0; ty < th; ty += step) {
          for (let tx = 0; tx < tw; tx += step) {
            const i = (ty * tw + tx) * 4;
            samples.push({ x: tx, y: ty, r: tplData[i], g: tplData[i+1], b: tplData[i+2] });
          }
        }
        const total = samples.length;
        if (total < 5) continue;

        // Slide step ~1/10 of template width
        const slideStep = Math.max(1, Math.round(tw / 10));
        let sim = 0, matchX = 0, matchY = 0;

        for (let y = 0; y <= srcH - th; y += slideStep) {
          for (let x = 0; x <= srcW - tw; x += slideStep) {
            let hit = 0;
            for (const p of samples) {
              const si = ((y + p.y) * srcW + (x + p.x)) * 4;
              if (
                Math.abs(srcData[si]   - p.r) <= COLOR_TOL &&
                Math.abs(srcData[si+1] - p.g) <= COLOR_TOL &&
                Math.abs(srcData[si+2] - p.b) <= COLOR_TOL
              ) hit++;
            }
            const score = (hit / total) * 100;
            if (score > sim) { sim = score; matchX = x; matchY = y; }
            if (sim >= 95) break;
          }
          if (sim >= 95) break;
        }

        if (sim > bestSim) {
          bestSim = sim; bestX = matchX; bestY = matchY; bestTW = tw; bestTH = th;
        }
        if (bestSim >= 95) break;
      }

      return { similarity: Math.round(bestSim * 10) / 10, x: bestX, y: bestY, w: bestTW, h: bestTH };
    } catch (e) {
      console.error('[MATCH] Error:', e.message);
      return { similarity: 0 };
    }
  });


  let lastNotifyTime = 0;
  ipcMain.on('discord-notify', async (event, { webhookUrl, message, embed }) => {
    const now = Date.now();
    if (now - lastNotifyTime < 150) { // Support up to ~6 per second safely
      return;
    }
    lastNotifyTime = now;

    try {
      if (!webhookUrl) return;
      await axios.post(webhookUrl, {
        content: message || "🔔 [비전 감지] 알림이 도착했습니다!",
        embeds: embed ? [embed] : []
      });
      console.log('[NOTIFICATION] Discord webhook sent successfully');
    } catch (e) {
      console.error('[NOTIFICATION_ERROR] Failed to send Discord webhook:', e.response?.data || e.message);
    }
  });

  // --- Keyboard Hook via uiohook-napi ---
  console.log('[LISTEN] Initializing uiohook-napi Keyboard Hook...');
  try {
    uIOhook.on('keydown', (e) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      
      const name = keyMap[e.keycode] || `UNKNOWN_${e.keycode}`;
      
      // Debounce: Only process if the key was not already pressed
      if (activeKeys.has(name)) return;
      activeKeys.add(name);
      
      console.log(`[KEY_EVENT] ${name} (DOWN)`);
      
      if (name === 'F9') {
        mainWindow.webContents.send('global-keydown', { key: 'F9' });
        return;
      }
      if (name === 'F10') {
        mainWindow.webContents.send('global-keydown', { key: 'F10' });
        return;
      }

      mainWindow.webContents.send('global-keydown', { key: name });
    });

    uIOhook.on('keyup', (e) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const name = keyMap[e.keycode] || `UNKNOWN_${e.keycode}`;
      
      activeKeys.delete(name);
      
      if (name === 'F9' || name === 'F10') return;
      mainWindow.webContents.send('global-keyup', { key: name });
    });

    uIOhook.start();
    console.log('[LISTEN] uiohook-napi Started Successfully');
  } catch (err) {
    console.error('[LISTEN_ERROR] Failed to start uiohook:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

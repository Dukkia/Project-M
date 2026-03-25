import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const MAX_SETS = 10;
const BAUD_RATE = 115200;

const getDefaultSets = () => Array(MAX_SETS).fill(null).map((_, i) => ({ id: i + 1, events: [], interval: 0 }));

const App = () => {
  const [profiles, setProfiles] = useState({ "DEFAULT": getDefaultSets() });

  // Load from File System on startup
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.loadData().then(data => {
        if (data) setProfiles(data);
      });
    }
  }, []);

  const [currentProfileName, setCurrentProfileName] = useState(() => {
    const saved = localStorage.getItem('m_controller_v8_active_profile');
    return saved || "DEFAULT";
  });

  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfileInput, setNewProfileInput] = useState("");

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeSetId, setActiveSetId] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false);

  // Load settings
  const [repeatCount, setRepeatCount] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).repeatCount : 20;
  });
  const [repeatMode, setRepeatMode] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).repeatMode : 'turns';
  });
  const [logs, setLogs] = useState([{ msg: '시스템 준비됨 (Pro v2)', time: new Date().toLocaleTimeString() }]);
  const [isRandomSet, setIsRandomSet] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).isRandomSet : false;
  });
  const [poolSetIds, setPoolSetIds] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).poolSetIds : [];
  });
  const [progress, setProgress] = useState(0);

  // Vision Trigger State
  const [visionEnabled, setVisionEnabled] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).visionEnabled : false;
  });
  const [selectedScreenId, setSelectedScreenId] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).selectedScreenId : null;
  });
  const [screens, setScreens] = useState([]);
  const [visionX, setVisionX] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).visionX : 100;
  });
  const [visionY, setVisionY] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).visionY : 100;
  });
  const [visionW, setVisionW] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).visionW : 10;
  });
  const [visionH, setVisionH] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).visionH : 10;
  });
  const [targetHexes, setTargetHexes] = useState(() => {
    const s = localStorage.getItem('m_settings');
    if (!s) return ["#FF0000"];
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed.targetHexes)) return parsed.targetHexes;
    return [parsed.targetHex || "#FF0000"];
  });
  const [pickingIndex, setPickingIndex] = useState(0);
  const [visionTolerance, setVisionTolerance] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).tolerance || 10) : 10;
  });
  const [isPicking, setIsPicking] = useState(false);
  const [pickMode, setPickMode] = useState('area'); // 'area' or 'pixel'
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [hoverColor, setHoverColor] = useState("#000000"); 
  const selectionContainerRef = useRef(null);

  // Live Vision Stream State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const pickerVideoRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);

  const writeRef = useRef(null);
  const isRecordingRef = useRef(false);
  const eventsRef = useRef([]);
  const startTimeRef = useRef(0);
  const activeSetIdRef = useRef(1);
  const isTypingRef = useRef(false); // Typing guard
  const isExecutingRef = useRef(false);
  const logEndRef = useRef(null);

  useEffect(() => { isExecutingRef.current = isExecuting; }, [isExecuting]);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { activeSetIdRef.current = activeSetId; }, [activeSetId]);

  useEffect(() => {
    localStorage.setItem('m_controller_v8_active_profile', currentProfileName);
    localStorage.setItem('m_settings', JSON.stringify({ 
      repeatCount, repeatMode, isRandomSet, poolSetIds, 
      visionX, visionY, visionW, visionH, targetHexes, visionEnabled, selectedScreenId,
      tolerance: visionTolerance
    }));

    // Save to File System via IPC
    if (window.electronAPI) {
      window.electronAPI.saveData(profiles);
    }
  }, [profiles, currentProfileName, repeatCount, repeatMode, isRandomSet, poolSetIds, visionX, visionY, visionW, visionH, targetHexes, visionEnabled]);

  useEffect(() => {
    // Start Live Stream for Real-time Monitoring
    const startStream = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          setStreamReady(false);
        }

        const id = await window.electronAPI.getMainSourceId(selectedScreenId);
        if (!id) return;
        if (!selectedScreenId) setSelectedScreenId(id);

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080
            }
          }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setStreamReady(true);
            addLog(`🎥 [${id}] 비전 스트림 시작`);
          };
        }
      } catch (e) {
        console.error("Stream Start Error:", e);
        addLog("⛔ 비전 스트림 시작 실패");
      }
    };
    if (window.electronAPI) startStream();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [selectedScreenId]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getScreenList().then(list => setScreens(list));
    }
  }, []);

  const searchAreaColorLocal = (x, y, w, h, hexList) => {
    if (!streamReady || !canvasRef.current || !videoRef.current) return false;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Scale matching
    const vx = (x / 1920) * video.videoWidth;
    const vy = (y / 1080) * video.videoHeight;
    const vw = (w / 1920) * video.videoWidth;
    const vh = (h / 1080) * video.videoHeight;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = Math.max(1, vw);
      canvas.height = Math.max(1, vh);
    }

    ctx.drawImage(video, vx, vy, vw, vh, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Prepare Targets
    const targets = hexList.map(hex => {
      const clean = hex.replace("#", "").toUpperCase();
      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16)
      };
    });

    const maxDist = (visionTolerance / 100) * 441; 

    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i];
      const pg = data[i+1];
      const pb = data[i+2];

      for (const t of targets) {
        const dr = pr - t.r;
        const dg = pg - t.g;
        const db = pb - t.b;
        const dist = Math.sqrt(dr*dr + dg*dg + db*db);
        if (dist <= maxDist) return true;
      }
    }
    return false;
  };

  // Preview Loop
  useEffect(() => {
    let animId;
    const updatePreview = () => {
      if (streamReady && videoRef.current && previewCanvasRef.current) {
        const video = videoRef.current;
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        
        const vx = (visionX / 1920) * video.videoWidth;
        const vy = (visionY / 1080) * video.videoHeight;
        const vw = (visionW / 1920) * video.videoWidth;
        const vh = (visionH / 1080) * video.videoHeight;

        if (vw > 0 && vh > 0) {
          ctx.drawImage(video, vx, vy, vw, vh, 0, 0, canvas.width, canvas.height);
        }
      }
      animId = setTimeout(updatePreview, 100); // 10 FPS is enough for preview
    };
    updatePreview();
    return () => clearTimeout(animId);
  }, [streamReady, visionX, visionY, visionW, visionH]);

  const addLog = (msg) => {
    setLogs(prev => [...prev.slice(-100), { msg, time: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const currentSets = profiles[currentProfileName] || getDefaultSets();

  const updateCurrentSets = (newSets) => {
    setProfiles(prev => ({ ...prev, [currentProfileName]: newSets }));
  };

  const startRecord = () => {
    if (isRecordingRef.current || isExecuting) return;
    setIsRecording(true);
    startTimeRef.current = performance.now();
    eventsRef.current = [];
    addLog(`🎬 [${currentProfileName}] 세트 ${activeSetIdRef.current} 녹화 시작`);
  };

  const stopRecord = () => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);
    if (eventsRef.current.length > 0) {
      const setId = activeSetIdRef.current;
      const newSets = currentSets.map(s => s.id === setId ? { ...s, events: [...eventsRef.current] } : s);
      updateCurrentSets(newSets);
      addLog(`✅ 저장 완료 (${eventsRef.current.length} 이벤트)`);
    } else { addLog("⏹ 저장할 데이터가 없어 취소되었습니다."); }
  };

  useEffect(() => {
    if (window.electronAPI) {
      const handleDown = (data) => {
        if (isTypingRef.current) return; // Ignore global shortcuts while typing
        const key = data.key.toString().toUpperCase();
        if (key === 'F9') { startRecord(); return; }
        if (key === 'F10') { stopRecord(); return; }
        if (isRecordingRef.current && key) {
          if (['MOUSE', 'CLICK', 'BUTTON'].some(m => key.includes(m))) return;
          const timestamp = (performance.now() - startTimeRef.current) / 1000;
          eventsRef.current.push({ type: 'down', key, time: timestamp });
          addLog(`[KEY] ${key} DOWN`);
        }
      };
      const handleUp = (data) => {
        if (isTypingRef.current) return;
        const key = data.key.toString().toUpperCase();
        if (key === 'F9' || key === 'F10') return;
        if (isRecordingRef.current && key) {
          if (['MOUSE', 'CLICK', 'BUTTON'].some(m => key.includes(m))) return;
          const timestamp = (performance.now() - startTimeRef.current) / 1000;
          eventsRef.current.push({ type: 'up', key, time: timestamp });
          addLog(`[KEY] ${key} UP`);
        }
      };
      const offDown = window.electronAPI.onGlobalKeyDown(handleDown);
      const offUp = window.electronAPI.onGlobalKeyUp(handleUp);

      return () => {
        if (offDown) offDown();
        if (offUp) offUp();
      };
    }
  }, [currentProfileName]);

  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      const writer = new TextEncoderStream();
      writer.readable.pipeTo(port.writable);
      writeRef.current = writer.writable.getWriter();
      setIsConnected(true);
      addLog("✅ 하드웨어 연결 성공");
    } catch (err) { addLog(`⛔ 시리얼 오류: ${err.message}`); }
  };

  const executeMacro = async () => {
    if (!isConnected) return alert("Pico 장치를 먼저 연결해 주세요.");

    // Check if any selected sets have data
    const availableSets = currentSets.filter(s => s.events.length > 0 && poolSetIds.includes(s.id));
    if (availableSets.length === 0 && !currentSets.some(s => s.events.length > 0)) {
      return alert("실행 가능한 데이터가 없습니다.");
    }

    isExecutingRef.current = true;
    setIsExecuting(true);
    let loop = 0;
    const startExecutionTime = Date.now();

    while (isExecutingRef.current) {
      const loopStartTime = Date.now();

      // Stop condition: Check Repeats (Turns) or Total Duration (Time)
      if (repeatMode === 'turns' && repeatCount !== 0 && loop >= repeatCount) break;
      if (repeatMode === 'time' && (loopStartTime - startExecutionTime) >= repeatCount * 60 * 1000) break;

      loop++;
      const now = Date.now();
      let targetSet = null;

      // 1. Check for FIXED INTERVALS (Turns only)
      const dueFixedSets = currentSets
        .filter(s => s.events.length > 0 && s.interval > 0 && loop % s.interval === 0)
        .sort((a, b) => a.interval - b.interval);

      if (dueFixedSets.length > 0) {
        targetSet = dueFixedSets[0];
      } else if (isRandomSet) {
        // 2. Otherwise pick from the random pool
        if (availableSets.length > 0) {
          targetSet = availableSets[Math.floor(Math.random() * availableSets.length)];
        }
      } else {
        // 3. Or just the active set
        targetSet = currentSets.find(s => s.id === activeSetId);
      }

      if (!targetSet || !targetSet.events.length) {
        if (!isRandomSet) {
          alert(`데이터가 없는 세트(#${targetSet?.id || activeSetId})를 실행하려고 했습니다.`);
          break;
        }
        continue;
      }

      const isFixed = targetSet.interval > 0 && loop % targetSet.interval === 0;

      addLog(`▶ [${currentProfileName}] L#${loop} ${isFixed ? '✨FIXED' : '🎲RAND'} SET #${targetSet.id}`);
      lastRunTimes[targetSet.id] = Date.now();

      let prev = 0;
      for (const ev of targetSet.events) {
        if (!isExecutingRef.current) break;
        const delay = Math.max(0, (ev.time - prev) * (0.95 + Math.random() * 0.12));
        if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
        prev = ev.time;
        await writeRef.current.write(`EV ${ev.type} ${ev.key}\n`);
        setProgress((targetSet.events.indexOf(ev) / targetSet.events.length) * 100);
      }
      if (repeatCount !== 0 && loop >= repeatCount) break;
      
      // --- VISION TRIGGER CHECK --- (REAL-TIME LIVE)
      if (visionEnabled) {
        const found = searchAreaColorLocal(visionX, visionY, visionW, visionH, targetHexes);
        if (found) {
          addLog(`🚫 VISION STOP: 감지된 색상 목록 중 하나`);
          isExecutingRef.current = false;
          setIsExecuting(false);
          break; 
        }
      }

      if (!isExecutingRef.current) break;
      await new Promise(r => setTimeout(r, 600));
    }
    setIsExecuting(false);
    setProgress(100);
  };

  const handlePickPixel = async (mode = 'area', index = 0) => {
    setPickMode(mode);
    setPickingIndex(index);
    setIsPicking(true);
    addLog(mode === 'area' ? "👀 감지 영역을 드래그하세요..." : "🎯 색상을 클릭하여 추출하세요...");
  };

  // Picker Escape handler
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isPicking) {
        setIsPicking(false);
        setDragStart(null);
        setDragCurrent(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isPicking]);

  // Stable Stream assignment for Picker
  useEffect(() => {
    if (isPicking && pickerVideoRef.current && streamRef.current) {
      pickerVideoRef.current.srcObject = streamRef.current;
    }
  }, [isPicking, streamReady]);

  const handleOverlayMouseDown = async (e) => {
    if (!selectionContainerRef.current) return;
    const rect = selectionContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // In pixel mode, we just care about where we clicked
    if (pickMode === 'pixel') {
      // Use the live hoverColor directly to ensure 1:1 match with loupe
      const newHexes = [...targetHexes];
      newHexes[pickingIndex] = hoverColor.toUpperCase();
      setTargetHexes(newHexes);
      addLog(`✨ 색상 캡처 [${pickingIndex}]: ${hoverColor}`);
      setIsPicking(false);
      return;
    }

    setDragStart({ x, y });
    setDragCurrent({ x, y });
  };

  const handleOverlayMouseMove = (e) => {
    if (!selectionContainerRef.current) return;
    const rect = selectionContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragCurrent({ x, y, clientX: e.clientX, clientY: e.clientY });

    // Zoom Loupe / Color Preview logic
    if (streamReady && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const vx = (x / rect.width) * video.videoWidth;
      const vy = (y / rect.height) * video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, vx, vy, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const hex = "#" + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      setHoverColor(hex);

      // Super Zoom Magnifier logic
      if (loupeCanvasRef.current) {
        const lCanvas = loupeCanvasRef.current;
        const lCtx = lCanvas.getContext('2d');
        lCtx.imageSmoothingEnabled = false; // Keep it pixelated

        // Draw 13x13 source area (larger area for larger loupe)
        const zoomSize = 13; 
        const halfSize = Math.floor(zoomSize / 2);
        lCtx.drawImage(video, vx - halfSize, vy - halfSize, zoomSize, zoomSize, 0, 0, lCanvas.width, lCanvas.height);
        
        // Draw Grid and Crosshair
        lCtx.strokeStyle = 'rgba(255,255,255,0.2)';
        lCtx.lineWidth = 0.5;
        const step = lCanvas.width / zoomSize;
        for(let i=0; i<=zoomSize; i++) {
          lCtx.beginPath(); lCtx.moveTo(i*step, 0); lCtx.lineTo(i*step, lCanvas.height); lCtx.stroke();
          lCtx.beginPath(); lCtx.moveTo(0, i*step); lCtx.lineTo(lCanvas.width, i*step); lCtx.stroke();
        }
        
        // Center crosshair (targeting the middle pixel)
        lCtx.strokeStyle = '#fff';
        lCtx.lineWidth = 1;
        lCtx.strokeRect(halfSize*step, halfSize*step, step, step); 
      }
    }
  };

  const handleOverlayMouseUp = async (e) => {
    if (!dragStart || !dragCurrent || !selectionContainerRef.current) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    
    const rect = selectionContainerRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;

    const x1 = Math.min(dragStart.x, dragCurrent.x);
    const y1 = Math.min(dragStart.y, dragCurrent.y);
    const x2 = Math.max(dragStart.x, dragCurrent.x);
    const y2 = Math.max(dragStart.y, dragCurrent.y);

    const realX = Math.round(x1 * scaleX);
    const realY = Math.round(y1 * scaleY);
    const realW = Math.round((x2 - x1) * scaleX);
    const realH = Math.round((y2 - y1) * scaleY);

    if (realW < 2 && realH < 2) {
      const newHexes = [...targetHexes];
      newHexes[pickingIndex] = hoverColor.toUpperCase();
      setTargetHexes(newHexes);
      addLog(`✨ 색상 캡처 [${pickingIndex}]: ${hoverColor}`);
    } else {
      setVisionX(realX);
      setVisionY(realY);
      setVisionW(realW || 1);
      setVisionH(realH || 1);
      addLog(`✅ 화면 지정 완료! (X:${realX}, Y:${realY}, W:${realW}, H:${realH})`);
    }

    setIsPicking(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  const togglePoolSet = (e, id) => {
    e.stopPropagation();
    const target = currentSets.find(s => s.id === id);
    if (!target || target.events.length === 0) return;
    setPoolSetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAddProfile = () => {
    if (newProfileInput.trim() && !profiles[newProfileInput]) {
      setProfiles(p => ({ ...p, [newProfileInput]: getDefaultSets() }));
      setCurrentProfileName(newProfileInput);
      setNewProfileInput("");
      setIsAddingProfile(false);
      addLog(`✨ 새 캐릭터 [${newProfileInput}] 생성됨`);
    }
  };

  const handleDeleteProfile = () => {
    if (currentProfileName === "DEFAULT") return;
    if (confirm(`[${currentProfileName}] 프로필을 삭제할까요?`)) {
      const next = { ...profiles };
      delete next[currentProfileName];
      setProfiles(next);
      setCurrentProfileName("DEFAULT");
      addLog(`🗑 삭제됨`);
    }
  };

  return (
    <div className="dashboard-container">
      <header>
        <div className="logo"><h1>M-Pro</h1></div>

        <div className="profile-selector">
          {!isAddingProfile ? (
            <>
              <select className="profile-select" value={currentProfileName} onChange={(e) => setCurrentProfileName(e.target.value)}>
                {Object.keys(profiles).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <button className="profile-btn" onClick={() => setIsAddingProfile(true)} title="새 캐릭터">+</button>
              <button className="profile-btn delete" onClick={handleDeleteProfile} disabled={currentProfileName === "DEFAULT"}>🗑</button>
            </>
          ) : (
            <>
              <input
                autoFocus
                className="profile-input"
                value={newProfileInput}
                onFocus={() => { isTypingRef.current = true; }}
                onBlur={() => { isTypingRef.current = false; }}
                onChange={e => setNewProfileInput(e.target.value)}
                placeholder="캐릭명..."
                onKeyDown={e => e.key === 'Enter' && handleAddProfile()}
              />
              <button className="profile-btn" onClick={handleAddProfile}>✓</button>
              <button className="profile-btn" onClick={() => setIsAddingProfile(false)}>✕</button>
            </>
          )}
        </div>
      </header>

      <div className="grid-main">
        <section className="left-panel card">
          <div className="set-btn-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
            {currentSets.map(s => (
              <div key={s.id} className={`set-btn ${activeSetId === s.id ? 'active' : ''} ${s.events.length > 0 ? 'has-data' : ''} ${poolSetIds.includes(s.id) ? 'in-pool' : ''}`} onClick={() => setActiveSetId(s.id)}>
                <button
                  className={`pool-toggle ${poolSetIds.includes(s.id) ? 'active' : ''} ${s.events.length === 0 ? 'disabled' : ''}`}
                  onClick={(e) => togglePoolSet(e, s.id)}
                  disabled={s.events.length === 0}
                  title={s.events.length === 0 ? '기록된 데이터가 없음' : 'RANDOM POOL 포함 여부'}
                >
                  {poolSetIds.includes(s.id) ? 'ON' : 'OFF'}
                </button>
                <div className="set-num">{s.id}</div>
              </div>
            ))}
          </div>

          <div className="active-set-info" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 900, color: 'var(--accent-cyan)', fontSize: '1rem' }}>SET #{activeSetId.toString().padStart(2, '0')}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentSets.find(s => s.id === activeSetId).events.length} Events</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="interval-input-group">
                  <span className="label-tiny">EVERY N TURNS:</span>
                  <input
                    type="text"
                    className="small-num-input"
                    value={currentSets.find(s => s.id === activeSetId).interval}
                    onChange={e => {
                      const val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                      updateCurrentSets(currentSets.map(s => s.id === activeSetId ? { ...s, interval: val } : s));
                    }}
                  />
                </div>
                <button className="profile-btn" style={{ width: 'auto', padding: '0 12px', fontSize: '0.65rem' }} onClick={() => {
                  updateCurrentSets(currentSets.map(s => s.id === activeSetId ? { ...s, events: [] } : s));
                  setPoolSetIds(prev => prev.filter(id => id !== activeSetId));
                }}>CLEAR SET</button>
              </div>
            </div>
          </div>

          <div className="console-wrapper">
            <div className="console-header">
              <div className="dots"><span></span><span></span><span></span></div>
              <div className="title">TERMINAL</div>
            </div>
            <div className="console-output">
              {logs.map((l, i) => <div key={i}><span style={{ opacity: 0.3 }}>[{l.time}]</span> {l.msg}</div>)}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>

        <section className="right-panel">
          <div className="card" style={{ gap: '1rem', height: '100%', justifyContent: 'center' }}>
            <div className="repeats-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span className="repeats-label">{repeatMode === 'turns' ? 'REPEATS' : 'DURATION'}</span>
                  <select
                    className="repeat-mode-select"
                    value={repeatMode}
                    onChange={e => setRepeatMode(e.target.value)}
                  >
                    <option value="turns">LOOP</option>
                    <option value="time">MIN</option>
                  </select>
                </div>
                <label className="random-toggle">
                  <input type="checkbox" checked={isRandomSet} onChange={e => setIsRandomSet(e.target.checked)} />
                  <span className="toggle-text">RANDOM MODE</span>
                </label>
              </div>
              <div className="repeats-stepper">
                <button className="stepper-btn" onClick={() => setRepeatCount(Math.max(0, repeatCount - 1))}>-</button>
                <input type="text" className="repeats-input" value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value.replace(/\D/g, '')) || 0)} />
                <button className="stepper-btn" onClick={() => setRepeatCount(repeatCount + 1)}>+</button>
              </div>
            </div>
            <button className="btn-primary" onClick={isExecuting ? () => { isExecutingRef.current = false; setIsExecuting(false); } : executeMacro} disabled={isRecording}>{isExecuting ? '⏹ STOP MACRO' : '▶ RUN MACRO'}</button>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button className="btn-record" style={{ flex: 1 }} onClick={startRecord} disabled={isRecording || isExecuting}>REC (F9)</button>
              <button className="btn-stop-rec" style={{ flex: 1 }} onClick={stopRecord} disabled={!isRecording}>STOP (F10)</button>
            </div>
            <div className="progress-container"><div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }}></div></div></div>

            {/* Vision Trigger UI */}
            <div className="vision-card" style={{ marginTop: '1rem', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>VISION STOP TRIGGER</span>
                  <select 
                    style={{ background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.2)', color: 'var(--accent-cyan)', fontSize: '0.6rem', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}
                    value={selectedScreenId || ""}
                    onChange={e => setSelectedScreenId(e.target.value)}
                  >
                    {screens.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                  </select>
                </div>
                <input type="checkbox" checked={visionEnabled} onChange={e => setVisionEnabled(e.target.checked)} />
              </div>

              <div style={{ marginBottom: '12px', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '240px', background: '#000', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--accent-cyan)', boxShadow: '0 0 15px var(--extra-glow)' }}>
                  <canvas ref={previewCanvasRef} width={160} height={90} style={{ 
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    aspectRatio: '16/9',
                    objectFit: 'cover',
                  }} title="지정 영역 실시간 미리보기" />
                  <div style={{ position: 'absolute', top: '4px', left: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div className="live-indicator-small" style={{ width: '6px', height: '6px', borderRadius: '50%', background: streamReady ? 'var(--success)' : '#444' }} />
                    <span style={{ fontSize: '0.4rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textShadow: '0 0 2px #000' }}>LIVE VIEW</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button className="btn-primary" style={{ flex: 1, padding: '6px', fontSize: '0.7rem', borderRadius: '6px', margin: 0 }} 
                  onClick={() => handlePickPixel('area')} disabled={isPicking}>
                  {isPicking ? 'WAIT...' : '🎯 DESIGNATE SCREEN'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="label-tiny" style={{ color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 800 }}>TARGET COLORS:</span>
                </div>
                <div className="no-scrollbar" style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', padding: '4px' }}>
                  {targetHexes.map((hex, idx) => (
                    <div key={idx} className="input-field" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
                      <div 
                        style={{ width: '14px', height: '14px', borderRadius: '3px', background: hex, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} 
                        onClick={() => handlePickPixel('pixel', idx)}
                        title="Click to pick color from screen"
                      />
                      <input className="small-num-input" style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: 900 }} type="text" value={hex} 
                        onFocus={() => isTypingRef.current = true} onBlur={() => isTypingRef.current = false}
                        onChange={e => {
                          const newHexes = [...targetHexes];
                          newHexes[idx] = e.target.value.toUpperCase();
                          setTargetHexes(newHexes);
                        }} />
                      {targetHexes.length > 1 && (
                        <button className="profile-btn" style={{ width: '18px', height: '18px', padding: 0, fontSize: '0.5rem', background: 'rgba(239, 68, 68, 0.2)' }} 
                          onClick={() => setTargetHexes(targetHexes.filter((_, i) => i !== idx))}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button className="profile-btn" style={{ width: '100%', padding: '4px', fontSize: '0.6rem', marginTop: '4px', borderStyle: 'dashed', background: 'rgba(34, 211, 238, 0.05)' }} 
                    onClick={() => setTargetHexes([...targetHexes, "#FFFFFF"])}>
                    + ADD COLOR
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'auto', width: '100%' }}>
              {!isConnected ? (
                <button className="btn-primary" onClick={connectSerial} style={{ width: '100%', margin: 0 }}>HARDWARE CONNECT</button>
              ) : (
                <div className={`status-badge ${isRecording ? 'busy' : ''}`} style={{ justifyContent: 'center', width: '100%' }}>
                  {isRecording ? '● REC ACTIVE' : 'ONLINE'}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      {/* Hidden Vision Engine */}
      <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {isPicking && streamRef.current && (
        <div className="selection-overlay" 
          onMouseMove={handleOverlayMouseMove} 
          onMouseUp={handleOverlayMouseUp}
          onMouseDown={handleOverlayMouseDown}
        >
          <div className="selection-instructions">
            {pickMode === 'area' ? "드래그: 감지 영역 지정 (ESC: 취소)" : "색상 위를 클릭하세요 (ESC: 취소)"}
          </div>
          <div ref={selectionContainerRef} className="selection-container">
            <video 
              autoPlay 
              playsInline
              ref={pickerVideoRef}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', pointerEvents: 'none' }}
            />
            {pickMode === 'area' && dragStart && dragCurrent && (
              <div className="selection-box" style={{
                left: Math.min(dragStart.x, dragCurrent.x),
                top: Math.min(dragStart.y, dragCurrent.y),
                width: Math.abs(dragCurrent.x - dragStart.x),
                height: Math.abs(dragCurrent.y - dragStart.y)
              }} />
            )}

          </div>
          <div className="selection-controls">
            <button className="btn-selection cancel" onMouseDown={e => e.stopPropagation()} onClick={() => { setIsPicking(false); setDragStart(null); setDragCurrent(null); }}>취소</button>
          </div>

          {/* Magnifier Loupe - Centered on Mouse globally in overlay */}
          {pickMode === 'pixel' && !dragStart && dragCurrent && (
            <div style={{
              position: 'fixed',
              left: Math.max(0, Math.min(window.innerWidth - 180, (dragCurrent?.clientX || 0) - 90)),
              top: Math.max(0, Math.min(window.innerHeight - 180, (dragCurrent?.clientY || 0) - 90)),
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              border: `5px solid ${hoverColor}`,
              background: '#000',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(34, 211, 238, 0.6)',
              pointerEvents: 'none',
              overflow: 'hidden',
              zIndex: 99999
            }}>
              <canvas ref={loupeCanvasRef} width={180} height={180} style={{ width: '100%', imageRendering: 'pixelated' }} />
              <div style={{ 
                position: 'absolute',
                bottom: '15px',
                background: 'rgba(0,0,0,0.85)', 
                padding: '3px 12px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: '#fff', 
                fontFamily: 'monospace', 
                fontWeight: 900,
                border: `1.5px solid ${hoverColor}`,
                boxShadow: '0 0 10px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontSize: '0.8rem' }}>{hoverColor}</div>
                <div style={{ fontSize: '0.55rem', opacity: 0.8, marginTop: '2px' }}>
                  X:{Math.round((dragCurrent.x / (selectionContainerRef.current?.offsetWidth || 1)) * 1920)} 
                  Y:{Math.round((dragCurrent.y / (selectionContainerRef.current?.offsetHeight || 1)) * 1080)}
                </div>
              </div>
              {/* Visual Center Point */}
              <div style={{ 
                position: 'absolute', 
                top: '50%', left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '2px', height: '2px', 
                background: '#ff0000',
                boxShadow: '0 0 2px #fff',
                borderRadius: '50%'
              }} />
            </div>
          )}

          {/* Fullscreen Axis Guides (Crosshair) */}
          {isPicking && dragCurrent && (
            <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: dragCurrent.clientY, height: '1px', background: 'rgba(34, 211, 238, 0.3)', boxShadow: '0 0 5px var(--extra-glow)' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: dragCurrent.clientX, width: '1px', background: 'rgba(34, 211, 238, 0.3)', boxShadow: '0 0 5px var(--extra-glow)' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;

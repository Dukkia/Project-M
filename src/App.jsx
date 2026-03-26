import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const MAX_SETS = 10;
const BAUD_RATE = 115200;

const CustomSelect = ({ value, options, onChange, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`custom-select-wrapper ${isOpen ? 'open' : ''}`} ref={containerRef} style={style}>
      <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span>{selectedOption ? selectedOption.label : value}</span>
        <span className="custom-select-chevron">▼</span>
      </div>
      <div className="custom-select-menu">
        {options.map(opt => (
          <div
            key={opt.value}
            className={`custom-select-option ${value === opt.value ? 'active' : ''}`}
            onClick={() => {
              onChange(opt.value);
              setIsOpen(false);
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );
};

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-warning">⚠</div>
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">{message}</div>
        <div className="modal-footer">
          <button className="btn-modal cancel" onClick={onCancel}>CANCEL</button>
          <button className="btn-modal confirm" onClick={() => { onConfirm(); onCancel(); }}>DELETE</button>
        </div>
      </div>
    </div>
  );
};

const getDefaultSets = () => Array(MAX_SETS).fill(null).map((_, i) => ({ id: i + 1, events: [], interval: 0 }));

const App = () => {
  const [profiles, setProfiles] = useState({ "DEFAULT": getDefaultSets() });

  // Load from File System on startup
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.loadData().then(data => {
        if (data) {
          setProfiles(data);
        }
        initialLoadDone.current = true;
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

  const [monActive, setMonActive] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monActive : false;
  });
  const [monSelectedId, setMonSelectedId] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monSelectedId : null;
  });
  const [monSourceList, setMonSourceList] = useState([]);
  const [monX, setMonX] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monX : 100;
  });
  const [monY, setMonY] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monY : 100;
  });
  const [monW, setMonW] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monW : 10;
  });
  const [monH, setMonH] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).monH : 10;
  });
  const [targetHexes, setTargetHexes] = useState(() => {
    const s = localStorage.getItem('m_settings');
    if (!s) return ["#FF0000"];
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed.targetHexes)) return parsed.targetHexes;
    return [parsed.targetHex || "#FF0000"];
  });
  const [pickingIndex, setPickingIndex] = useState(0);
  const [monTolerance, setMonTolerance] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).monTolerance || 10) : 10;
  });
  const [isPicking, setIsPicking] = useState(false);
  const [pickMode, setPickMode] = useState('area'); // 'area' or 'pixel'
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).discordWebhookUrl : "";
  });
  const [notificationEnabled, setNotificationEnabled] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? JSON.parse(s).notificationEnabled : false;
  });
  const [visionMode, setVisionMode] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).visionMode || 'color') : 'color';
  });
  const [imageTemplates, setImageTemplates] = useState(() => {
    const s = localStorage.getItem('m_settings');
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed.imageTemplates)) return parsed.imageTemplates;
      // Migration from single template
      if (parsed.imageTemplate) return [parsed.imageTemplate];
    } catch (e) { }
    return [];
  });
  const [imageSimilarityThreshold, setImageSimilarityThreshold] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).imageSimilarityThreshold || 90) : 90;
  });
  const [rightPanelTab, setRightPanelTab] = useState('control');
  const [globalTab, setGlobalTab] = useState('macro');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [currentSimilarity, setCurrentSimilarity] = useState(0);
  const currentSimilarityRef = useRef(0);
  const lastMatchIndexRef = useRef(0);
  const [monDebug, setMonDebug] = useState("");
  const [lastMatchPos, setLastMatchPos] = useState(null); // {x, y, w, h, index} for visual tracking
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [alarmMatchInfo, setAlarmMatchInfo] = useState("");
  const isMonitoringRef = useRef(false);
  useEffect(() => { isMonitoringRef.current = isMonitoring; }, [isMonitoring]);

  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [hoverColor, setHoverColor] = useState("#000000");
  const [setDelayMin, setSetDelayMin] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).setDelayMin || 50) : 50;
  });
  const [setDelayMax, setSetDelayMax] = useState(() => {
    const s = localStorage.getItem('m_settings');
    return s ? (JSON.parse(s).setDelayMax || 400) : 400;
  });
  const selectionContainerRef = useRef(null);

  // Live Vision Stream State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const pickerVideoRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const initialLoadDone = useRef(false);

  const writeRef = useRef(null);
  const isRecordingRef = useRef(false);
  const eventsRef = useRef([]);
  const startTimeRef = useRef(0);
  const activeSetIdRef = useRef(1);
  const isTypingRef = useRef(false); // Typing guard
  const isExecutingRef = useRef(false);
  const logEndRef = useRef(null);

  const templateImgRefs = useRef([]);
  useEffect(() => {
    templateImgRefs.current = [];
    if (!imageTemplates || imageTemplates.length === 0) return;

    imageTemplates.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        templateImgRefs.current.push(img);
        if (templateImgRefs.current.length === imageTemplates.length) {
          addLog(`✅ 이미지 템플릿 로드 완료 (${imageTemplates.length}개)`);
        }
      };
      img.src = src;
    });
  }, [imageTemplates]);

  useEffect(() => { isExecutingRef.current = isExecuting; }, [isExecuting]);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { activeSetIdRef.current = activeSetId; }, [activeSetId]);

  const speedFactor = 1.0;
  const lastRunTimes = {};

  useEffect(() => {
    // Avoid saving until the initial load from disk is complete
    if (!initialLoadDone.current) return;

    localStorage.setItem('m_controller_v8_active_profile', currentProfileName);
    localStorage.setItem('m_settings', JSON.stringify({
      repeatCount, repeatMode, isRandomSet, poolSetIds,
      monX, monY, monW, monH, targetHexes, monActive, monSelectedId,
      monTolerance, setDelayMin, setDelayMax,
      discordWebhookUrl, notificationEnabled, visionMode, imageTemplates, imageSimilarityThreshold
    }));

    // Save to File System via IPC
    if (window.electronAPI) {
      window.electronAPI.saveData(profiles);
    }
  }, [profiles, currentProfileName, repeatCount, repeatMode, isRandomSet, poolSetIds, monX, monY, monW, monH, targetHexes, monActive]);

  useEffect(() => {
    // Start Live Stream for Real-time Monitoring
    let active = true;
    const startStream = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          setStreamReady(false);
        }

        const id = await window.electronAPI.getMainSourceId(monSelectedId);
        if (!id) return;
        if (!monSelectedId) setMonSelectedId(id);

        // 1) Try native stream first (works in non-admin mode)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: id,
                minWidth: 1280, maxWidth: 4000,
                minHeight: 720, maxHeight: 4000
              }
            }
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              setStreamReady(true);
              addLog(`🎥 [${id}] 비전 스트림 시작 (네이티브)`);
            };
          }
          return; // Native works, done!
        } catch (nativeErr) {
          console.warn("Native stream failed, switching to polling:", nativeErr.message);
          addLog(`⚠️ 네이티브 스트림 차단됨 → 폴링 모드 전환 중...`);
        }

        // 2) Fallback: Polling screenshots → canvas → captureStream (Admin-mode compatible)
        const pollCanvas = document.createElement('canvas');
        pollCanvas.width = 1280;
        pollCanvas.height = 720;
        const ctx = pollCanvas.getContext('2d');
        const canvasStream = pollCanvas.captureStream(0); // 0 = manual frame push
        streamRef.current = canvasStream;
        if (videoRef.current) {
          videoRef.current.srcObject = canvasStream;
        }

        let started = false;
        let loading = false;
        const img = new Image();

        const poll = async () => {
          if (!active) return;
          if (loading) { setTimeout(poll, 50); return; }
          loading = true;
          try {
            const dataUrl = await window.electronAPI.getScreenshot();
            if (dataUrl && active) {
              img.onload = () => {
                ctx.drawImage(img, 0, 0, 1280, 720);
                const tracks = canvasStream.getVideoTracks();
                if (tracks[0]?.requestFrame) tracks[0].requestFrame();
                if (!started) {
                  started = true;
                  setStreamReady(true);
                  addLog(`🎥 [${id}] 비전 스트림 시작 (폴링 모드)`);
                }
                loading = false;
                if (active) setTimeout(poll, 100); // ~10 FPS
              };
              img.onerror = () => { loading = false; if (active) setTimeout(poll, 500); };
              img.src = dataUrl;
            } else {
              loading = false;
              if (active) setTimeout(poll, 500);
            }
          } catch (e) {
            loading = false;
            if (active) setTimeout(poll, 1000);
          }
        };
        poll();
      } catch (e) {
        console.error("Stream Start Error:", e);
        addLog(`⛔ 비전 스트림 실패: ${e.name} - ${e.message}`);
      }
    };
    if (window.electronAPI) startStream();
    return () => {
      active = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [monSelectedId]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getScreenList().then(list => setMonSourceList(list));
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

    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];

      for (const t of targets) {
        const dr = pr - t.r;
        const dg = pg - t.g;
        const db = pb - t.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist <= maxDist) return true;
      }
    }
    return false;
  };

  const cvMatchRunning = useRef(false);
  const checkImageSimilarity = async () => {
    if (!streamReady || !videoRef.current || templateImgRefs.current.length === 0) return { similarity: 0 };
    if (cvMatchRunning.current) return { similarity: currentSimilarityRef.current };
    cvMatchRunning.current = true;

    try {
      const video = videoRef.current;
      if (video.videoWidth === 0) return { similarity: 0 };

      const vx = (monX / 1920) * video.videoWidth;
      const vy = (monY / 1080) * video.videoHeight;
      const vw = (monW / 1920) * video.videoWidth;
      const vh = (monH / 1080) * video.videoHeight;

      const sw = 640;
      const srcScale = sw / Math.max(1, vw);
      const sh = Math.max(10, Math.round(vh * srcScale));

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = sw; srcCanvas.height = sh;
      const srcCtx = srcCanvas.getContext('2d', { alpha: false });
      srcCtx.drawImage(video, vx, vy, vw, vh, 0, 0, sw, sh);

      const imgData = srcCtx.getImageData(0, 0, sw, sh);
      const srcData = imgData.data;

      const scaleSteps = [1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2];
      const COLOR_TOL = 40;
      let globalBestSim = 0;
      let globalBestMatch = null;
      let globalDebug = '';

      for (let idx = 0; idx < templateImgRefs.current.length; idx++) {
        const tplImg = templateImgRefs.current[idx];
        if (!tplImg.complete || tplImg.naturalWidth === 0) continue;

        const origW = tplImg.naturalWidth;
        const origH = tplImg.naturalHeight;

        let bestSim = 0, matchX = 0, matchY = 0, bestTW = 0, bestTH = 0;

        for (const sc of scaleSteps) {
          const tw = Math.round(origW * srcScale * sc);
          const th = Math.round(origH * srcScale * sc);
          if (tw > sw || th > sh || tw < 8 || th < 8) continue;

          const rCanvas = document.createElement('canvas');
          rCanvas.width = tw; rCanvas.height = th;
          const rCtx = rCanvas.getContext('2d', { alpha: false });
          rCtx.imageSmoothingEnabled = true;
          rCtx.drawImage(tplImg, 0, 0, tw, th);
          const rData = rCtx.getImageData(0, 0, tw, th).data;

          const step = Math.max(1, Math.round(Math.sqrt((tw * th) / 1200)));
          const samples = [];
          for (let ty = 0; ty < th; ty += step) {
            for (let tx = 0; tx < tw; tx += step) {
              const i = (ty * tw + tx) * 4;
              samples.push({ x: tx, y: ty, r: rData[i], g: rData[i + 1], b: rData[i + 2] });
            }
          }
          const total = samples.length;
          if (total < 5) continue;

          const slideStep = Math.max(1, Math.round(tw / 10));
          let sim = 0, currX = 0, currY = 0;

          for (let y = 0; y <= sh - th; y += slideStep) {
            for (let x = 0; x <= sw - tw; x += slideStep) {
              let hit = 0;
              for (const p of samples) {
                const si = ((y + p.y) * sw + (x + p.x)) * 4;
                if (
                  Math.abs(srcData[si] - p.r) <= COLOR_TOL &&
                  Math.abs(srcData[si + 1] - p.g) <= COLOR_TOL &&
                  Math.abs(srcData[si + 2] - p.b) <= COLOR_TOL
                ) hit++;
              }
              const score = (hit / total) * 100;
              if (score > sim) { sim = score; currX = x; currY = y; }
              if (sim >= 95) break;
            }
            if (sim >= 95) break;
          }

          if (sim > bestSim) {
            bestSim = sim; matchX = currX; matchY = currY; bestTW = tw; bestTH = th;
          }
          if (bestSim >= 95) break;
        }

        if (bestSim > globalBestSim) {
          globalBestSim = bestSim;
          const lx = monW / sw;
          const ly = monH / sh;
          globalBestMatch = {
            similarity: bestSim,
            x: monX + matchX * lx,
            y: monY + matchY * ly,
            w: bestTW * lx,
            h: bestTH * ly,
            index: idx
          };
          globalDebug = `T[${idx}]:${Math.round(origW * srcScale)}x${Math.round(origH * srcScale)}`;
        }
        // if any template passes threshold, no need to check others
        if (globalBestSim >= imageSimilarityThreshold) break;
      }

      const result = globalBestMatch || { similarity: 0, x: 0, y: 0, w: 0, h: 0 };

      setCurrentSimilarity(result.similarity);
      currentSimilarityRef.current = result.similarity;
      lastMatchIndexRef.current = result.index || 0;
      setMonDebug(globalDebug || '0:0x0');
      setLastMatchPos(result.similarity > 20 ? result : null);

      if (result.similarity >= imageSimilarityThreshold) {
        if (isMonitoringRef.current) addLog(`🎯 IMAGE DETECTED (#${(result.index || 0) + 1}): ${result.similarity.toFixed(1)}%`);
      }
      return result;
    } catch (e) {
      console.error('checkImageSimilarity error:', e);
      return { similarity: 0 };
    } finally {
      cvMatchRunning.current = false;
    }
  };

  // Preview Loop
  useEffect(() => {
    let animId;
    const updatePreview = async () => {
      if (streamReady && videoRef.current && previewCanvasRef.current) {
        const video = videoRef.current;
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });

        // Map selection coordinates (1920x1080 logical) to actual video resolution
        const vx = (monX / 1920) * video.videoWidth;
        const vy = (monY / 1080) * video.videoHeight;
        const vw = (monW / 1920) * video.videoWidth;
        const vh = (monH / 1080) * video.videoHeight;

        if (vw > 0 && vh > 0) {
          if (canvas.width !== 800) canvas.width = 800;
          canvas.height = (vh / vw) * 800;
          ctx.drawImage(video, vx, vy, vw, vh, 0, 0, canvas.width, canvas.height);

          // --- Visual Tracking Box (Orange) ---
          if (lastMatchPos && lastMatchPos.similarity > 10) {
            // Map logical coordinates back to preview canvas scale
            const scX = canvas.width / vw;
            const scY = canvas.height / vh;
            const rx = (lastMatchPos.x - monX) * scX;
            const ry = (lastMatchPos.y - monY) * scY;
            const rw = lastMatchPos.w * scX;
            const rh = lastMatchPos.h * scY;

            ctx.strokeStyle = '#ff9900';
            ctx.lineWidth = 3;
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.fillStyle = '#ff9900';
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.fillText(`${lastMatchPos.similarity.toFixed(0)}%`, rx, ry > 20 ? ry - 10 : ry + 25);
          }
        } else {
          canvas.width = 800;
          canvas.height = 450;
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 800, 450);
        }

        if (isMonitoringRef.current) {
          await checkImageSimilarity();
        }
      }
      animId = setTimeout(updatePreview, 500); // 500ms: OpenCV IPC is async, avoid stacking
    };
    updatePreview();
    return () => clearTimeout(animId);
  }, [streamReady, monX, monY, monW, monH]);

  // --- High Frequency Discord Alarm Loop ---
  useEffect(() => {
    let intervalId;
    if (isAlarmActive && notificationEnabled && discordWebhookUrl) {
      intervalId = setInterval(() => {
        // Appended @everyone to force phone vibration/push alerts unconditionally
        window.electronAPI.discordNotify(discordWebhookUrl, `🚨 @everyone [비전 감지] 대상 출현! (${alarmMatchInfo} | 일치율: ${currentSimilarity.toFixed(1)}%)`, {
          title: "🚨 Vision Target Detected 🚨",
          color: 0xff0000,
          fields: [
            { name: "진행 상태", value: `⚠️ **알람 모드 실행 중! (정지 버튼 클릭 시까지 폭격)**\n🎯 **감지 대상: ${alarmMatchInfo} (${currentSimilarity.toFixed(1)}%)**`, inline: false },
            { name: "감지 위치", value: `X:${monX}, Y:${monY} (Size: ${monW}x${monH})`, inline: true },
            { name: "감지 시간", value: new Date().toLocaleTimeString(), inline: true }
          ]
        });
      }, 500); // 500ms (2 per sec) is the maximum speed allowed before Discord blocks IP (HTTP 429).
    }
    return () => clearInterval(intervalId);
  }, [isAlarmActive, notificationEnabled, discordWebhookUrl, monX, monY, monW, monH, currentSimilarity]);

  // Standalone Monitoring Loop
  useEffect(() => {
    let timer;
    const runMonitor = async () => {
      if (isMonitoringRef.current && !isExecutingRef.current && monActive) {
        let found = false;
        if (visionMode === 'color') {
          found = searchAreaColorLocal(monX, monY, monW, monH, targetHexes);
        } else if (visionMode === 'image' && imageTemplates.length > 0) {
          // We read directly from the ultra-fast 15FPS preview loop to guarantee 100% sync
          found = currentSimilarityRef.current >= imageSimilarityThreshold;
        }

        if (found) {
          const matchTarget = visionMode === 'image' ? `이미지 템플릿 #${(lastMatchIndexRef.current) + 1}번` : "지정 색상";
          addLog(`🎯 [IMAGE DETECTION] Trigger activated! (${currentSimilarityRef.current.toFixed(0)}%) - ${matchTarget}`);
          setAlarmMatchInfo(matchTarget);
          setIsAlarmActive(true); // Engages the high-frequency Discord loop & Modal
          setIsMonitoring(false); // Stop the vision scanning while alarm is ringing
        }
      }
      timer = setTimeout(runMonitor, 1000);
    };
    runMonitor();
    return () => clearTimeout(timer);
  }, [monActive, monX, monY, monW, monH, targetHexes, discordWebhookUrl, notificationEnabled, visionMode, imageTemplates, imageSimilarityThreshold]);

  const addLog = (msg) => {
    setLogs(prev => [...prev.slice(-100), { msg, time: new Date().toLocaleTimeString() }]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const currentSets = profiles[currentProfileName] || getDefaultSets();

  const updateSet = (setId, updates) => {
    setProfiles(prev => {
      const currentProfileSets = prev[currentProfileName] || getDefaultSets();
      const newSets = currentProfileSets.map(s => s.id === setId ? { ...s, ...updates } : s);
      return { ...prev, [currentProfileName]: newSets };
    });
  };

  const startRecord = () => {
    if (isRecordingRef.current || isExecutingRef.current) return;
    setIsRecording(true);
    startTimeRef.current = performance.now();
    eventsRef.current = [];
    addLog(`🎬 [${currentProfileName}] 세트 ${activeSetIdRef.current} 녹화 시작`);
  };

  const stopRecord = () => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);
    if (eventsRef.current.length > 0) {
      updateSet(activeSetIdRef.current, { events: [...eventsRef.current] });
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
      // Only attempt to open if not already open
      if (!port.readable && !port.writable) {
        try {
          await port.open({ baudRate: BAUD_RATE });
        } catch (e) {
          if (!e.message.includes("already") && !e.message.includes("in progress")) {
            throw e;
          }
        }
      }

      // Prevent piping multiple times if hot-reloaded
      if (!writeRef.current) {
        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable);
        writeRef.current = textEncoder.writable.getWriter();

        // --- ADDED: Serial Reader Loop ---
        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                // Log messages from Pico (strip whitespace)
                const msg = value.trim();
                if (msg) addLog(`[PICO] ${msg}`);
              }
            }
          } catch (err) {
            console.error('Serial Read Error:', err);
          } finally {
            reader.releaseLock();
          }
        })();
      }

      setIsConnected(true);
      addLog("✅ 하드웨어 연결 성공 (포트 개방됨)");
    } catch (err) {
      addLog(`⛔ 시리얼 오류: ${err.message}`);
    }
  };

  const executeMacro = async () => {
    if (!isConnected) return alert("Pico 장치를 먼저 연결해 주세요.");

    // Check if any selected sets have data
    const availableSets = currentSets.filter(s => s.events.length > 0 && poolSetIds.includes(s.id) && s.interval === 0);
    if (availableSets.length === 0 && !currentSets.some(s => s.events.length > 0)) {
      return alert("실행 가능한 데이터가 없습니다.");
    }

    isExecutingRef.current = true;
    setIsExecuting(true);
    const pressedKeys = new Set(); // Track keys that are currently "down"

    try {
      // Countdown before start
      for (let i = 3; i > 0; i--) {
        addLog(`⏳ ${i}초 후 시작...`);
        await new Promise(r => setTimeout(r, 1000));
        if (!isExecutingRef.current) return;
      }
      addLog("🚀 매크로 실행 시작!");

      let loop = 0;
      const startExecutionTime = Date.now();

      while (isExecutingRef.current) {
        const loopStartTime = Date.now();

        // Stop condition: Check Repeats (Turns) or Total Duration (Time)
        if (repeatMode === 'turns' && repeatCount !== 0 && loop >= repeatCount) break;
        if (repeatMode === 'time' && (loopStartTime - startExecutionTime) >= repeatCount * 60 * 1000) break;

        loop++;
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
          const delay = Math.max(0, (ev.time - prev) * speedFactor);
          if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
          prev = ev.time;

          // Ensure standard mapping for playback too (last safety net)
          let playbackKey = ev.key;
          if (playbackKey === 'ESCAPE') playbackKey = 'ESC';
          if (playbackKey.startsWith('ARROW')) playbackKey = playbackKey.replace('ARROW', '');

          // Track state to prevent stuck keys on stop
          if (ev.type === 'down') pressedKeys.add(playbackKey);
          else if (ev.type === 'up') pressedKeys.delete(playbackKey);

          await writeRef.current.write(`EV ${ev.type} ${playbackKey}\r\n`);
          setProgress((targetSet.events.indexOf(ev) / targetSet.events.length) * 100);
        }
        if (repeatMode === 'turns' && repeatCount !== 0 && loop >= repeatCount) break;

        // --- VISION TRIGGER CHECK --- (REAL-TIME LIVE)
        if (monActive) {
          let found = false;
          if (visionMode === 'color') {
            found = searchAreaColorLocal(monX, monY, monW, monH, targetHexes);
          } else if (visionMode === 'image' && imageTemplate) {
            found = checkImageSimilarity();
          }

          if (found) {
            addLog(`🚫 VISION STOP: 감지된 색상 목록 중 하나`);
            if (notificationEnabled && discordWebhookUrl) {
              window.electronAPI.discordNotify(discordWebhookUrl, "🛑 [매크로 정지] 비전 감지에 의해 매크로가 중단되었습니다.");
            }
            isExecutingRef.current = false;
            break;
          }
        }

        if (!isExecutingRef.current) break;
        const finalGap = Math.floor(Math.random() * (setDelayMax - setDelayMin + 1)) + setDelayMin;
        await new Promise(r => setTimeout(r, Math.max(0, finalGap)));
      }
    } catch (e) {
      console.error("Execution Error:", e);
      addLog(`⛔ 매크로 실행 중 오류: ${e.message}`);
    } finally {
      // RELEASE STUCK KEYS
      if (writeRef.current && pressedKeys.size > 0) {
        addLog(`🧹 멈춤 감지: ${pressedKeys.size}개 키 해제 중...`);
        for (const key of pressedKeys) {
          try {
            await writeRef.current.write(`EV up ${key}\r\n`);
            await new Promise(r => setTimeout(r, 10)); // Tiny gap
          } catch { }
        }
        pressedKeys.clear();
      }
      setIsExecuting(false);
      isExecutingRef.current = false;
      setProgress(100);
    }
  };

  const handlePickPixel = async (mode = 'area', index = 0) => {
    if (!streamRef.current || !streamReady) {
      addLog("⚠️ 화면 스트림이 준비되지 않았습니다. 화면을 먼저 선택하거나 잠시만 대기해주세요.");
      return;
    }
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
        for (let i = 0; i <= zoomSize; i++) {
          lCtx.beginPath(); lCtx.moveTo(i * step, 0); lCtx.lineTo(i * step, lCanvas.height); lCtx.stroke();
          lCtx.beginPath(); lCtx.moveTo(0, i * step); lCtx.lineTo(lCanvas.width, i * step); lCtx.stroke();
        }

        // Center crosshair (targeting the middle pixel)
        lCtx.strokeStyle = '#fff';
        lCtx.lineWidth = 1;
        lCtx.strokeRect(halfSize * step, halfSize * step, step, step);
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
      setMonX(realX);
      setMonY(realY);
      setMonW(realW || 1);
      setMonH(realH || 1);
      addLog(`✅ 화면 지정 완료! (X:${realX}, Y:${realY}, W:${realW}, H:${realH})`);
    }

    setIsPicking(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  const captureImageTemplate = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const vx = (monX / 1920) * video.videoWidth;
    const vy = (monY / 1080) * video.videoHeight;
    const vw = (monW / 1920) * video.videoWidth;
    const vh = (monH / 1080) * video.videoHeight;

    if (vw === 0 || vh === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw);
    canvas.height = Math.round(vh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, vx, vy, vw, vh, 0, 0, vw, vh);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setImageTemplates(prev => [...prev, dataUrl]);
    setImageTemplates(prev => {
      addLog(`📸 템플릿 저장 (${Math.round(vw)}x${Math.round(vh)}) - 총 ${prev.length}개`);
      return prev;
    });
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      let count = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          setImageTemplates(prev => [...prev, event.target.result]);
          count++;
          if (count === files.length) {
            addLog(`📂 템플릿 ${files.length}개 로드 완료`);
          }
        };
        reader.readAsDataURL(file);
      });
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => setGlobalTab('macro')}><h1>M-Pro</h1></div>

          <nav style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
            <button
              className={`nav-tab ${globalTab === 'macro' ? 'active' : ''}`}
              onClick={() => setGlobalTab('macro')}
              style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 900, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', background: globalTab === 'macro' ? 'var(--accent-cyan)' : 'transparent', color: globalTab === 'macro' ? '#000' : 'var(--text-muted)' }}
            >
              DASHBOARD
            </button>
            <button
              className={`nav-tab ${globalTab === 'vision' ? 'active' : ''}`}
              onClick={() => setGlobalTab('vision')}
              style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 900, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', background: globalTab === 'vision' ? 'var(--accent-cyan)' : 'transparent', color: globalTab === 'vision' ? '#000' : 'var(--text-muted)' }}
            >
              VISION SYSTEM
            </button>
          </nav>
        </div>

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

      {globalTab === 'macro' ? (
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
                        updateSet(activeSetId, { interval: val });
                      }}
                    />
                  </div>
                  <button className="profile-btn" style={{ width: 'auto', padding: '0 10px', fontSize: '0.65rem' }} onClick={() => {
                    setModalConfig({
                      isOpen: true,
                      title: "DATA DELETION WARNING",
                      message: `SET #${activeSetId.toString().padStart(2, '0')}의 모든 기록 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
                      onConfirm: () => {
                        updateSet(activeSetId, { events: [] });
                        setPoolSetIds(prev => prev.filter(id => id !== activeSetId));
                      }
                    });
                  }}>CLEAR SET</button>
                </div>
              </div>
            </div>

            <div className="console-wrapper">
              <div className="console-header">
                <div className="dots"><span></span><span></span><span></span></div>
                <button className="clear-console-btn" onClick={clearLogs}>CLEAR</button>
              </div>
              <div className="console-output">
                {logs.map((l, i) => <div key={i}><span style={{ opacity: 0.3 }}>[{l.time}]</span> {l.msg}</div>)}
                <div ref={logEndRef} />
              </div>
            </div>
          </section>

          <section className="right-panel">
            <div className="card" style={{ gap: '1.2rem', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <div className="repeats-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="repeats-label" style={{ fontSize: '0.7rem', fontWeight: 900 }}>{repeatMode === 'turns' ? 'ITERATION' : 'DURATION'}</span>
                  <label className="random-toggle" style={{ background: 'rgba(255,255,255,0.05)', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={isRandomSet} onChange={e => setIsRandomSet(e.target.checked)} />
                    <span className="toggle-text" style={{ fontSize: '0.6rem', color: isRandomSet ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>RANDOM MODE</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                  <div className="repeats-stepper" style={{ flex: 1 }}>
                    <button className="stepper-btn" style={{ padding: '0 12px' }} onClick={() => setRepeatCount(Math.max(0, repeatCount - 1))}>-</button>
                    <input type="text" className="repeats-input" style={{ width: '100%' }} value={repeatCount} onFocus={() => isTypingRef.current = true} onBlur={() => isTypingRef.current = false} onChange={e => setRepeatCount(parseInt(e.target.value.replace(/\D/g, '')) || 0)} />
                    <button className="stepper-btn" style={{ padding: '0 12px' }} onClick={() => setRepeatCount(repeatCount + 1)}>+</button>
                  </div>
                  <CustomSelect
                    value={repeatMode}
                    options={[
                      { value: 'turns', label: 'LOOP' },
                      { value: 'time', label: 'MIN' }
                    ]}
                    onChange={(val) => setRepeatMode(val)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                  <span className="repeats-label" style={{ fontSize: '0.65rem' }}>SET GAP (ms)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      className="small-num-input"
                      style={{ width: '50px', textAlign: 'center', background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.2)' }}
                      value={setDelayMin}
                      onFocus={() => { isTypingRef.current = true; }}
                      onBlur={() => { isTypingRef.current = false; }}
                      onChange={e => setSetDelayMin(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>~</span>
                    <input
                      type="text"
                      className="small-num-input"
                      style={{ width: '50px', textAlign: 'center', background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.2)' }}
                      value={setDelayMax}
                      onFocus={() => { isTypingRef.current = true; }}
                      onBlur={() => { isTypingRef.current = false; }}
                      onChange={e => setSetDelayMax(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <button
                  className={`btn-primary ${isExecuting ? 'active' : ''}`}
                  style={{ padding: '18px', fontSize: '1.1rem', background: isExecuting ? 'var(--danger)' : '' }}
                  onClick={isExecuting ? () => { isExecutingRef.current = false; setIsExecuting(false); } : executeMacro}
                  disabled={isRecording}
                >
                  {isExecuting ? '⏹ STOP MACRO' : '▶ RUN MACRO'}
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-record" style={{ flex: 1, padding: '12px' }} onClick={startRecord} disabled={isRecording || isExecuting}>REC (F9)</button>
                  <button className="btn-stop-rec" style={{ flex: 1, padding: '12px' }} onClick={stopRecord} disabled={!isRecording}>STOP (F10)</button>
                </div>
              </div>

              <div className="progress-container" style={{ marginTop: '15px' }}>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }}></div></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', marginTop: '5px', color: 'var(--text-muted)' }}>
                  <span>PROGRESS</span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>

              <div style={{ marginTop: 'auto', width: '100%', paddingTop: '1.2rem', borderTop: '1px solid var(--glass-border)' }}>
                {!isConnected ? (
                  <button className="btn-primary" onClick={connectSerial} style={{ width: '100%', margin: 0, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>HARDWARE DISCONNECTED</button>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="live-indicator" style={{ width: '8px', height: '8px' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--success)' }}>HARDWARE ONLINE</span>
                    </div>
                    <div style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>COM READY</div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="vision-workspace" style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0, paddingBottom: '1rem' }}>
          <section style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <div className="card" style={{
              background: '#000',
              overflow: 'hidden',
              padding: '0',
              position: 'relative',
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 0 30px var(--extra-glow)',
              width: '100%',
              maxWidth: '850px',
              aspectRatio: (monW && monH) ? `${monW}/${monH}` : '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ position: 'absolute', top: '20px', left: '25px', zIndex: 10, display: 'flex', gap: '12px' }}>
                <div className={`status-badge ${streamReady ? 'success' : 'busy'}`} style={{ background: 'rgba(0,0,0,0.8)', padding: '6px 15px', backdropFilter: 'blur(5px)' }}>
                  {streamReady ? '● LIVE STREAM' : '● CONNECTING...'}
                </div>
                {monSourceList.length > 0 && (
                  <div style={{ pointerEvents: 'auto' }}>
                    <CustomSelect
                      value={monSelectedId}
                      options={monSourceList.map(s => ({ value: s.id, label: s.name.toUpperCase() }))}
                      onChange={(val) => setMonSelectedId(val)}
                      style={{ height: '32px', fontSize: '0.65rem' }}
                    />
                  </div>
                )}
                {isMonitoring && (
                  <div className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.3)', color: '#fff', border: '1px solid var(--danger)', padding: '6px 15px' }}>
                    🕵️ ACTIVE MONITORING
                  </div>
                )}
                {isExecuting && (
                  <div className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.3)', color: '#fff', border: '1px solid var(--success)', padding: '6px 15px' }}>
                    🎮 MACRO RUNNING
                  </div>
                )}
              </div>

              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <canvas ref={previewCanvasRef} style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#000'
                }} onClick={() => handlePickPixel('pixel', 0)} />
                <div style={{ position: 'absolute', bottom: '15px', right: '15px', display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px', fontSize: '0.7rem', borderRadius: '30px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid var(--accent-cyan)' }} onClick={() => handlePickPixel('area')}>🎯 AREA</button>
                </div>
              </div>
            </div>
          </section>

          <section style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="card" style={{ flex: 1, gap: '1.5rem', overflowY: 'auto', padding: '1.5rem' }}>
              <h2 className="card-title">VISION WORKSPACE</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className={`btn-primary ${isMonitoring ? 'active' : ''}`}
                  style={{ padding: '15px 10px', fontSize: '0.75rem', borderRadius: '12px', background: isMonitoring ? 'var(--danger)' : 'var(--accent-cyan)', color: isMonitoring ? '#fff' : '#000' }}
                  onClick={() => setIsMonitoring(!isMonitoring)}
                >
                  {isMonitoring ? '⏹ STOP MONITOR' : '🕵️ START MONITOR'}
                </button>
                <button
                  className="btn-primary"
                  style={{ padding: '15px 10px', fontSize: '0.75rem', borderRadius: '12px', background: isExecuting ? 'var(--danger)' : 'var(--success)', color: '#fff' }}
                  onClick={isExecuting ? () => { isExecutingRef.current = false; setIsExecuting(false); } : executeMacro}
                >
                  {isExecuting ? '⏹ STOP MACRO' : '▶ RUN MACRO'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 900 }}>TRIGGER MODE</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Auto-stop on detect</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CustomSelect
                    value={visionMode}
                    options={[
                      { value: 'color', label: 'COLOR' },
                      { value: 'image', label: 'IMAGE' }
                    ]}
                    onChange={(val) => setVisionMode(val)}
                  />
                  <input type="checkbox" checked={monActive} onChange={e => setMonActive(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                </div>
              </div>

              <div style={{ padding: '15px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#a5b4fc', letterSpacing: '1px' }}>DISCORD ALERT NOTIFICATION</span>
                  <input type="checkbox" checked={notificationEnabled} onChange={e => setNotificationEnabled(e.target.checked)} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(165, 180, 252, 0.3)', color: 'white', padding: '10px', fontSize: '0.7rem', borderRadius: '8px', outline: 'none' }}
                    placeholder="Discord Webhook URL"
                    value={discordWebhookUrl}
                    onChange={e => setDiscordWebhookUrl(e.target.value)}
                  />
                  <button className="profile-btn" style={{ width: 'auto', padding: '0 15px', fontWeight: 900 }} onClick={() => discordWebhookUrl && window.electronAPI.discordNotify(discordWebhookUrl, "🧪 Webhook Test")}>TEST</button>
                </div>
              </div>

              {visionMode === 'color' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title" style={{ fontSize: '0.7rem', margin: 0 }}>TARGET COLORS</span>
                    <button className="profile-btn" style={{ width: 'auto', padding: '2px 10px', fontSize: '0.6rem' }} onClick={() => setTargetHexes(["#FFFFFF"])}>RESET</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {targetHexes.map((hex, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: hex, border: '2px solid rgba(255,255,255,0.1)', cursor: 'pointer', boxShadow: `0 0 10px ${hex}44` }} onClick={() => handlePickPixel('pixel', idx)} />
                        <span style={{ flex: 1, fontFamily: 'monospace', fontWeight: 900, fontSize: '0.75rem' }}>{hex}</span>
                        <button className="profile-btn" style={{ width: '22px', height: '22px', borderRadius: '50%', padding: 0 }} onClick={() => setTargetHexes(targetHexes.filter((_, i) => i !== idx))}>×</button>
                      </div>
                    ))}
                    <button className="profile-btn" style={{ padding: '12px', fontSize: '0.75rem', borderStyle: 'dashed', borderRadius: '10px' }} onClick={() => setTargetHexes([...targetHexes, "#FFFFFF"])}>+</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title" style={{ fontSize: '0.7rem', margin: 0 }}>IMAGE TEMPLATES</span>
                    {imageTemplates.length > 0 && (
                      <button className="profile-btn" style={{ width: 'auto', padding: '2px 10px', fontSize: '0.6rem' }} onClick={() => setImageTemplates([])}>CLEAR ALL</button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }}>
                    {imageTemplates.length > 0 ? imageTemplates.map((imgSrc, i) => (
                      <div key={i} style={{ position: 'relative', width: '100%', aspectRatio: '1', background: '#000', borderRadius: '8px', border: '1px solid var(--accent-cyan)', overflow: 'hidden' }}>
                        <img src={imgSrc} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        <button className="profile-btn" style={{ position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px', padding: 0, fontSize: '10px', background: 'rgba(0,0,0,0.7)' }} onClick={() => setImageTemplates(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    )) : (
                      <div style={{ padding: '20px 0', gridColumn: '1 / -1', textAlign: 'center', color: '#334155', fontSize: '0.7rem', fontWeight: 800 }}>NO TEMPLATE IMAGES</div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <button className="btn-primary" onClick={captureImageTemplate} style={{ padding: '8px', fontSize: '0.65rem' }}>CAPTURE</button>
                    <label className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', fontSize: '0.65rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--accent-cyan)' }}>
                      UPLOAD
                      <input type="file" accept="image/*" hidden multiple onChange={handleFileUpload} />
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '5px', border: currentSimilarity >= imageSimilarityThreshold ? '1px solid var(--success)' : '1px solid transparent' }}>
                      <span style={{ fontSize: '0.45rem', fontWeight: 800, color: currentSimilarity >= imageSimilarityThreshold ? 'var(--success)' : 'var(--text-muted)' }}>
                        {isMonitoring ? `MATCH: ${currentSimilarity.toFixed(0)}%` : 'THRESHOLD'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="text" className="small-num-input" style={{ width: '30px', fontSize: '0.6rem' }} value={imageSimilarityThreshold} onChange={e => setImageSimilarityThreshold(parseInt(e.target.value.replace(/\D/g, '')) || 0)} />
                        <span style={{ fontSize: '0.6rem', fontWeight: 900 }}>%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`status-dot ${isConnected ? 'online' : 'offline'}`} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: isConnected ? 'var(--success)' : 'var(--danger)' }}>{isConnected ? 'SERIAL ONLINE' : 'DISCONNECTED'}</span>
                  </div>
                  {!isConnected && <button className="profile-btn" style={{ width: 'auto', padding: '5px 15px', fontSize: '0.6rem' }} onClick={connectSerial}>CONNECT</button>}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
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

      {/* Extreme Alarm Overlay Modal */}
      {isAlarmActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255, 0, 0, 0.25)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'pulse-bg 0.5s infinite alternate'
        }}>
          <style>{`
            @keyframes pulse-bg { 0% { background: rgba(255, 0, 0, 0.25); } 100% { background: rgba(255, 0, 0, 0.6); } }
            @keyframes pulse-btn { 0% { transform: scale(1); box-shadow: 0 0 20px rgba(255,0,0,0.5); } 100% { transform: scale(1.05); box-shadow: 0 0 50px rgba(255,255,255,1); } }
          `}</style>
          <h1 style={{ color: '#fff', fontSize: '3.5rem', fontWeight: 900, textShadow: '0 0 20px #ff0000', marginBottom: '40px', letterSpacing: '2px' }}>
            🚨 TARGET DETECTED 🚨
          </h1>
          <button
            style={{
              background: '#ff0000', color: '#fff', border: '5px solid #fff', borderRadius: '50px',
              padding: '20px 80px', fontSize: '2.5rem', fontWeight: 900, cursor: 'pointer',
              animation: 'pulse-btn 0.3s infinite alternate'
            }}
            onClick={() => setIsAlarmActive(false)}
          >
            STOP ALARM
          </button>
        </div>
      )}

      <ConfirmationModal
        {...modalConfig}
        onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default App;

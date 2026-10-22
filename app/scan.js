// 読み取り：スマホのカメラと、キーボードとして入力する専用スキャナー
"use strict";
(function () {
  const S = {};
  let audio = null;
  S.beep = kind => {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      const f = { ok: 1320, dup: 880, warn: 520, ng: 300 }[kind] || 1000;
      o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + (kind === "ng" ? 0.25 : 0.08));
      if (kind === "dup") { const o2 = audio.createOscillator(); o2.frequency.value = 880; o2.connect(g); o2.start(audio.currentTime + 0.12); o2.stop(audio.currentTime + 0.2); }
    } catch {}
  };
  S.unlockAudio = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {} };

  // 同じ番号を続けて読んだときは2.5秒間は無視する
  function deduper(cb) {
    let last = "", at = 0;
    return (code, src) => { const t = Date.now(); if (code === last && t - at < 2500) return; last = code; at = t; cb(code, src); };
  }

  // 専用スキャナー：入力欄に打ち込まれた番号を拾う（Enterあり・なしの両方）
  S.bindInput = (input, cb) => {
    const fire = deduper(cb);
    let timer = null;
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); const v = input.value.trim(); input.value = ""; if (v) fire(v, "scanner"); }
    });
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const v = input.value.replace(/\D/g, "");
      if (v.length === 13) timer = setTimeout(() => { if (input.value.replace(/\D/g, "") === v) { input.value = ""; fire(v, "scanner"); } }, 250);
    });
  };

  // カメラ：端末の読み取り機能があればそれを、なければライブラリを使う
  S.startCamera = async (video, cb, onEngine) => {
    const fire = deduper(cb);
    S.unlockAudio();
    let native = false;
    if ("BarcodeDetector" in window) { try { native = (await BarcodeDetector.getSupportedFormats()).includes("ean_13"); } catch {} }
    if (native) {
      onEngine && onEngine("端末の機能");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream; video.setAttribute("playsinline", ""); await video.play();
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8"] });
      let live = true;
      (async function loop() {
        while (live) {
          try { const r = await det.detect(video); for (const x of r) fire(x.rawValue, "camera"); } catch {}
          await new Promise(r => setTimeout(r, 90));
        }
      })();
      return () => { live = false; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    }
    onEngine && onEngine("ライブラリ");
    if (!window.ZXing) throw new Error("読み取りの部品を読み込めませんでした");
    const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]], [ZXing.DecodeHintType.TRY_HARDER, true]]);
    const reader = new ZXing.BrowserMultiFormatReader(hints, 100);
    await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }, video, res => { if (res) fire(res.getText(), "camera"); });
    return () => reader.reset();
  };

  window.Scan = S;
})();

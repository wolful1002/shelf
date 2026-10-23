// 画面の共通部品：上の帯（メニュー・保存の状態）、鍵の設定、お知らせの表示
"use strict";
(function () {
  const U = {};
  U.$ = id => document.getElementById(id);
  U.esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  U.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  U.nowIso = () => new Date().toISOString();

  const PAGES = [["index.html", "ホーム"], ["library.html", "蔵書"], ["novels.html", "必読書"], ["films.html", "映画"]];
  // 上の帯：チェッカーの画面と同じもの（見た目は app/bar.css）
  U.topbar = active => {
    const el = document.createElement("div");
    el.className = "shelfbar noprint"; el.id = "shelfBar";
    el.innerHTML = `<div class="sb-in"><a class="sb-brand" href="index.html">shelf</a><nav aria-label="画面">${PAGES.map(([h, n]) => `<a href="${h}"${h === active ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav><span class="sb-sync" id="shelfSync" role="status">…</span></div>`;
    document.body.prepend(el);
    const pill = el.querySelector("#shelfSync");
    Shelf.onStatus(s => {
      const m = { ok: "保存済み", idle: "準備中", syncing: s.msg || "通信中", pending: `送信待ち ${s.pending}件`, offline: s.pending ? `電波なし・送信待ち ${s.pending}件` : "電波なし", error: "保存できていません", notoken: "鍵が未設定" };
      pill.textContent = (m[s.state] || s.state) + (s.state === "error" && s.msg ? `：${s.msg}` : ""); pill.dataset.state = s.state; pill.title = s.msg || "";
    });
  };

  U.toast = (msg, ms = 2600) => {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  };

  // 鍵がなければ設定を求める。設定済みなら何もしない
  U.keyCard = () => {
    const box = document.createElement("section");
    box.className = "card"; box.id = "keyCard";
    box.innerHTML = `<h2>鍵の設定</h2>
      <p class="small">記録用の保管場所（shelf-data）を読み書きするための鍵を、この端末に入れます。鍵はこの端末の中にだけ保存されます。</p>
      <input type="password" id="keyIn" autocomplete="off" placeholder="github_pat_ で始まる文字列" aria-label="鍵">
      <div class="row"><button type="button" class="pri" id="keySave">保存して始める</button><span class="small muted" id="keyMsg"></span></div>`;
    box.querySelector("#keySave").onclick = async () => {
      const v = box.querySelector("#keyIn").value.trim(); if (!v) return;
      Shelf.setToken(v);
      box.querySelector("#keyMsg").textContent = "確かめています…";
      await Shelf.refresh();
      if (Shelf.status().state === "error" || Shelf.status().state === "notoken") { box.querySelector("#keyMsg").textContent = "読み込めませんでした：" + Shelf.status().msg; return; }
      location.reload();
    };
    return box;
  };

  U.dialog = (title, bodyHtml, onClose) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<div class="dh"><h2 style="flex:1">${U.esc(title)}</h2><button type="button" class="quiet small" data-close>閉じる</button></div><div class="db">${bodyHtml}</div>`;
    document.body.appendChild(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => { d.remove(); onClose && onClose(); });
    d.showModal();
    return d;
  };

  window.UI = U;
})();

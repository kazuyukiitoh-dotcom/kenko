/* 体重・血圧ノート 本体 */
(function () {
  "use strict";

  const STORAGE_KEY = "health-records-v1";

  // ---------- データ ----------
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function createRecordId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // 旧データや取込データでも、編集対象を必ず一意に特定できるようにする。
  function ensureRecordIds(items) {
    const seen = new Set();
    let changed = false;
    for (const item of items) {
      if (!item.id || seen.has(item.id)) {
        item.id = createRecordId();
        changed = true;
      }
      seen.add(item.id);
    }
    return changed;
  }

  function recordTime(r) {
    return new Date(r.date + "T" + (r.time || "00:00")).getTime();
  }

  function sortedRecords() {
    return [...records].sort((a, b) => recordTime(a) - recordTime(b));
  }

  let records = loadRecords();
  if (ensureRecordIds(records)) saveRecords(records);
  let editingId = null;
  let rangeDays = 30;

  // ---------- タブ ----------
  const panels = {
    input: document.getElementById("tab-input"),
    chart: document.getElementById("tab-chart"),
    history: document.getElementById("tab-history"),
    data: document.getElementById("tab-data"),
  };

  function switchTab(name) {
    for (const key in panels) panels[key].hidden = key !== name;
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    if (name === "chart") renderCharts();
    if (name === "history") renderHistory();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tab-btn").forEach(b => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  // ---------- フォーム ----------
  const form = document.getElementById("record-form");
  const fDate = document.getElementById("f-date");
  const fTime = document.getElementById("f-time");
  const fWeight = document.getElementById("f-weight");
  const fSys1 = document.getElementById("f-sys1");
  const fDia1 = document.getElementById("f-dia1");
  const fSys2 = document.getElementById("f-sys2");
  const fDia2 = document.getElementById("f-dia2");
  const fPulse1 = document.getElementById("f-pulse1");
  const fPulse2 = document.getElementById("f-pulse2");
  const fNote = document.getElementById("f-note");
  const formError = document.getElementById("form-error");
  const formTitle = document.getElementById("form-title");
  const saveBtn = document.getElementById("save-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const confirmDialog = document.getElementById("confirm-dialog");
  const confirmTitle = document.getElementById("confirm-title");
  const confirmMessage = document.getElementById("confirm-message");
  const confirmDetails = document.getElementById("confirm-details");
  const confirmAccept = document.getElementById("confirm-accept");
  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function setCurrentDateTime() {
    const now = new Date();
    fDate.value = localDateValue(now);
    fTime.value = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  // モバイルで連続入力しやすいよう、確定した数値から次の欄へ進める。
  const inputOrder = [
    fDate, fTime, fWeight,
    fSys1, fDia1, fPulse1,
    fSys2, fDia2, fPulse2,
    fNote, saveBtn,
  ];
  const autoAdvanceFields = [fSys1, fDia1, fPulse1, fSys2, fDia2, fPulse2];

  function focusNextField(field) {
    const index = inputOrder.indexOf(field);
    const next = inputOrder[index + 1];
    if (next && !next.disabled) next.focus();
  }

  inputOrder.slice(0, -1).forEach(field => {
    field.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      focusNextField(field);
    });
  });

  autoAdvanceFields.forEach(field => {
    field.addEventListener("input", () => {
      if (!field.validity.valid || field.value.trim().length < 2) return;
      // iOSではタイマー後のfocusが拒否されるため、入力イベント内で同期的に移動する。
      focusNextField(field);
    });
  });

  const displayFields = [
    ["日付", r => r.date || "–"],
    ["時刻", r => r.time || "–"],
    ["体重", r => r.weight != null ? r.weight.toFixed(1) + " kg" : "–"],
    ["1回目の血圧", r => r.sys1 != null ? r.sys1 + "/" + r.dia1 + " mmHg" : "–"],
    ["2回目の血圧", r => r.sys2 != null ? r.sys2 + "/" + r.dia2 + " mmHg" : "–"],
    ["血圧平均", r => r.sys != null ? r.sys + "/" + r.dia + " mmHg" : "–"],
    ["1回目の脈拍", r => r.pulse1 != null ? r.pulse1 + " 拍/分" : "–"],
    ["2回目の脈拍", r => r.pulse2 != null ? r.pulse2 + " 拍/分" : "–"],
    ["脈拍平均", r => r.pulse != null ? r.pulse + " 拍/分" : "–"],
    ["メモ", r => r.note || "–"],
  ];

  function addConfirmRow(label, oldValue, newValue, danger) {
    const row = document.createElement("div");
    row.className = "change-row" + (danger ? " danger" : "");
    const name = document.createElement("span");
    name.className = "change-label";
    name.textContent = label;
    const values = document.createElement("div");
    values.className = "change-values";
    const oldText = document.createElement("span");
    oldText.className = "change-old";
    oldText.textContent = oldValue;
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    const newText = document.createElement("span");
    newText.className = "change-new";
    newText.textContent = newValue;
    values.append(oldText, arrow, newText);
    row.append(name, values);
    confirmDetails.appendChild(row);
  }

  function askConfirmation({ title, message, acceptLabel, oldRecord, newRecord, danger = false }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmAccept.textContent = acceptLabel;
    confirmDialog.classList.toggle("delete-mode", danger);
    confirmDetails.textContent = "";

    let count = 0;
    for (const [label, format] of displayFields) {
      const oldValue = format(oldRecord);
      const newValue = newRecord ? format(newRecord) : "削除";
      if (danger || oldValue !== newValue) {
        addConfirmRow(label, oldValue, newValue, danger);
        count++;
      }
    }
    if (!count) return Promise.resolve(false);

    if (typeof confirmDialog.showModal !== "function") {
      return Promise.resolve(window.confirm(message));
    }
    return new Promise(resolve => {
      const onClose = () => resolve(confirmDialog.returnValue === "confirm");
      confirmDialog.addEventListener("close", onClose, { once: true });
      confirmDialog.showModal();
    });
  }

  function resetForm() {
    editingId = null;
    form.reset();
    setCurrentDateTime();
    formTitle.textContent = "今日の記録";
    saveBtn.textContent = "保存する";
    cancelEditBtn.hidden = true;
    formError.hidden = true;
    document.getElementById("bp-average").hidden = true;
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  // 血圧・脈拍の入力値(1回目・2回目)を検証し、平均を計算する。
  // 戻り値: { sys, dia, pulse, sys1, ... } または null(すべて未入力)。エラー時は文字列を返す。
  function readMeasurements() {
    const num = f => (f.value === "" ? null : Number(f.value));
    const s1 = num(fSys1), d1 = num(fDia1), s2 = num(fSys2), d2 = num(fDia2);
    const p1 = num(fPulse1), p2 = num(fPulse2);

    if (s1 === null && d1 === null && s2 === null && d2 === null && p1 === null && p2 === null) return null;
    if ((s1 === null) !== (d1 === null) || (s2 === null) !== (d2 === null)) {
      return "血圧は収縮期・拡張期をセットで入力してください。";
    }
    if (s1 === null && s2 !== null) {
      return "血圧は1回目から入力してください。";
    }
    for (const [s, d, label] of [[s1, d1, "1回目"], [s2, d2, "2回目"]]) {
      if (s !== null && s <= d) return label + "の収縮期血圧は拡張期血圧より大きい値を入力してください。";
    }
    // 2回目があれば平均、なければ入力された側の値をそのまま採用
    const avg = (a, b) => (a !== null && b !== null) ? Math.round((a + b) / 2) : (a ?? b);
    return {
      sys: avg(s1, s2), dia: avg(d1, d2), pulse: avg(p1, p2),
      sys1: s1, dia1: d1, sys2: s2, dia2: d2, pulse1: p1, pulse2: p2,
    };
  }

  // 入力中の平均をリアルタイム表示
  const bpAvgBox = document.getElementById("bp-average");
  const bpAvgVal = document.getElementById("bp-average-val");
  function updateAveragePreview() {
    const m = readMeasurements();
    if (m && typeof m === "object" && (m.sys !== null || m.pulse !== null)) {
      const parts = [];
      if (m.sys !== null) parts.push(m.sys + "/" + m.dia + " mmHg");
      if (m.pulse !== null) parts.push("脈拍 " + m.pulse);
      bpAvgVal.textContent = parts.join("・");
      bpAvgBox.hidden = false;
    } else {
      bpAvgBox.hidden = true;
    }
  }
  [fSys1, fDia1, fSys2, fDia2, fPulse1, fPulse2].forEach(f => f.addEventListener("input", updateAveragePreview));

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    formError.hidden = true;

    const weight = fWeight.value === "" ? null : Number(fWeight.value);
    const m = readMeasurements();

    if (typeof m === "string") {
      showError(m);
      return;
    }
    if (weight === null && m === null) {
      showError("体重・血圧・脈拍のいずれかを入力してください。");
      return;
    }

    const rec = {
      id: editingId || createRecordId(),
      date: fDate.value,
      time: fTime.value,
      weight,
      sys: m ? m.sys : null,
      dia: m ? m.dia : null,
      sys1: m ? m.sys1 : null,
      dia1: m ? m.dia1 : null,
      sys2: m ? m.sys2 : null,
      dia2: m ? m.dia2 : null,
      pulse: m ? m.pulse : null,
      pulse1: m ? m.pulse1 : null,
      pulse2: m ? m.pulse2 : null,
      note: fNote.value.trim(),
    };

    if (editingId) {
      const idx = records.findIndex(r => r.id === editingId);
      if (idx < 0) {
        showError("修正対象の記録が見つかりません。履歴から選び直してください。");
        return;
      }
      const hasChanges = displayFields.some(([, format]) => format(records[idx]) !== format(rec));
      if (!hasChanges) {
        showError("変更された項目はありません。");
        return;
      }
      const approved = await askConfirmation({
        title: "変更内容の確認",
        message: "強調表示された項目だけが変更されます。対象と内容を確認してください。",
        acceptLabel: "この内容で変更",
        oldRecord: records[idx],
        newRecord: rec,
      });
      if (!approved) return;
      const currentIdx = records.findIndex(r => r.id === editingId);
      if (currentIdx < 0) {
        showError("修正対象の記録が見つかりません。履歴から選び直してください。");
        return;
      }
      records[currentIdx] = rec;
    } else {
      records.push(rec);
    }
    saveRecords(records);
    resetForm();
    switchTab("chart");
  });

  cancelEditBtn.addEventListener("click", resetForm);

  function startEdit(id) {
    const r = records.find(rr => rr.id === id);
    if (!r) return;
    editingId = id;
    fDate.value = r.date;
    fTime.value = r.time || "00:00";
    fWeight.value = r.weight ?? "";
    // 旧形式(平均のみ)の記録は1回目欄に読み込む
    fSys1.value = (r.sys1 ?? r.sys) ?? "";
    fDia1.value = (r.dia1 ?? r.dia) ?? "";
    fSys2.value = r.sys2 ?? "";
    fDia2.value = r.dia2 ?? "";
    fPulse1.value = (r.pulse1 ?? r.pulse) ?? "";
    fPulse2.value = r.pulse2 ?? "";
    updateAveragePreview();
    fNote.value = r.note || "";
    formTitle.textContent = "記録を編集: " + r.date + " " + (r.time || "");
    saveBtn.textContent = "更新する";
    cancelEditBtn.hidden = false;
    switchTab("input");
  }

  // ---------- 期間フィルタ ----------
  document.querySelectorAll(".range-btn").forEach(b => {
    b.addEventListener("click", () => {
      rangeDays = Number(b.dataset.days);
      document.querySelectorAll(".range-btn").forEach(x => x.classList.toggle("active", x === b));
      renderCharts();
    });
  });

  function filteredRecords() {
    const all = sortedRecords();
    if (!rangeDays) return all;
    const from = Date.now() - rangeDays * 86400000;
    return all.filter(r => recordTime(r) >= from);
  }

  // ---------- 統計タイルとグラフ ----------
  const S1 = () => getComputedStyle(document.documentElement).getPropertyValue("--series-1").trim();
  const S2 = () => getComputedStyle(document.documentElement).getPropertyValue("--series-2").trim();

  function renderStats() {
    const all = sortedRecords();
    const wRecs = all.filter(r => r.weight != null);
    const bpRecs = all.filter(r => r.sys != null);

    const statW = document.getElementById("stat-weight");
    const statWD = document.getElementById("stat-weight-delta");
    if (wRecs.length) {
      const last = wRecs[wRecs.length - 1];
      statW.innerHTML = "";
      statW.append(last.weight.toFixed(1));
      const small = document.createElement("small");
      small.textContent = " kg";
      statW.appendChild(small);
      if (wRecs.length >= 2) {
        const diff = last.weight - wRecs[wRecs.length - 2].weight;
        statWD.textContent = (diff >= 0 ? "+" : "") + diff.toFixed(1) + " kg(前回比)";
        statWD.className = "stat-delta " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
      } else {
        statWD.textContent = "";
      }
    } else {
      statW.textContent = "–";
      statWD.textContent = "";
    }

    const statBP = document.getElementById("stat-bp");
    const statBPT = document.getElementById("stat-bp-time");
    if (bpRecs.length) {
      const last = bpRecs[bpRecs.length - 1];
      statBP.innerHTML = "";
      statBP.append(last.sys + "/" + last.dia);
      const small = document.createElement("small");
      small.textContent = " mmHg";
      statBP.appendChild(small);
      statBPT.textContent = last.date.slice(5).replace("-", "/") + " " + (last.time || "")
        + (last.pulse != null ? "・脈拍 " + last.pulse : "");
      statBPT.className = "stat-delta";
    } else {
      statBP.textContent = "–";
      statBPT.textContent = "";
    }
  }

  // 選択期間の平均値カード
  function renderAverages(recs) {
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const ws = recs.filter(r => r.weight != null).map(r => r.weight);
    const ss = recs.filter(r => r.sys != null).map(r => r.sys);
    const ds = recs.filter(r => r.dia != null).map(r => r.dia);
    const ps = recs.filter(r => r.pulse != null).map(r => r.pulse);

    document.getElementById("avg-weight").textContent = ws.length ? mean(ws).toFixed(1) + " kg" : "–";
    document.getElementById("avg-bp").textContent = ss.length ? Math.round(mean(ss)) + "/" + Math.round(mean(ds)) : "–";
    document.getElementById("avg-pulse").textContent = ps.length ? Math.round(mean(ps)) + " 拍/分" : "–";
  }

  function renderCharts() {
    renderStats();
    const recs = filteredRecords();
    renderAverages(recs);

    const wPts = recs.filter(r => r.weight != null).map(r => ({ t: recordTime(r), v: r.weight }));
    renderLineChart(document.getElementById("chart-weight"), {
      series: [{ name: "体重", color: S1(), points: wPts }],
      unit: "kg",
      decimals: 1,
    });

    const sysPts = recs.filter(r => r.sys != null).map(r => ({ t: recordTime(r), v: r.sys }));
    const diaPts = recs.filter(r => r.dia != null).map(r => ({ t: recordTime(r), v: r.dia }));
    document.getElementById("bp-legend").hidden = sysPts.length === 0;
    renderLineChart(document.getElementById("chart-bp"), {
      series: [
        { name: "収縮期", color: S1(), points: sysPts },
        { name: "拡張期", color: S2(), points: diaPts },
      ],
      unit: "mmHg",
      decimals: 0,
      refLines: sysPts.length ? [{ v: 135, label: "135" }, { v: 85, label: "85" }] : [],
    });

    const pulsePts = recs.filter(r => r.pulse != null).map(r => ({ t: recordTime(r), v: r.pulse }));
    renderLineChart(document.getElementById("chart-pulse"), {
      series: [{ name: "脈拍", color: S1(), points: pulsePts }],
      unit: "拍/分",
      decimals: 0,
    });
  }

  // ---------- 履歴 ----------
  function renderHistory() {
    const tbody = document.querySelector("#history-table tbody");
    tbody.textContent = "";
    const all = sortedRecords().reverse();
    document.getElementById("history-empty").hidden = all.length > 0;
    document.querySelector(".table-wrap").hidden = all.length === 0;

    for (const r of all) {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.dataset.label = "日時";
      tdDate.textContent = r.date.slice(5).replace("-", "/") + " " + (r.time || "");
      const tdW = document.createElement("td");
      tdW.dataset.label = "体重";
      tdW.textContent = r.weight != null ? r.weight.toFixed(1) + " kg" : "–";
      const tdBP = document.createElement("td");
      tdBP.dataset.label = "血圧平均";
      if (r.sys != null) {
        tdBP.textContent = r.sys + "/" + r.dia;
        if (r.sys2 != null) {
          const detail = document.createElement("div");
          detail.className = "bp-detail";
          detail.textContent = r.sys1 + "/" + r.dia1 + "・" + r.sys2 + "/" + r.dia2;
          tdBP.appendChild(detail);
        }
      } else {
        tdBP.textContent = "–";
      }
      const tdP = document.createElement("td");
      tdP.dataset.label = "脈拍平均";
      if (r.pulse != null) {
        tdP.textContent = String(r.pulse);
        if (r.pulse2 != null && r.pulse1 != null) {
          const detail = document.createElement("div");
          detail.className = "bp-detail";
          detail.textContent = r.pulse1 + "・" + r.pulse2;
          tdP.appendChild(detail);
        }
      } else {
        tdP.textContent = "–";
      }
      const tdN = document.createElement("td");
      tdN.dataset.label = "メモ";
      tdN.className = "note-cell";
      tdN.textContent = r.note || "";

      const tdA = document.createElement("td");
      tdA.dataset.label = "操作";
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "mini-btn";
      editBtn.textContent = "修正";
      editBtn.addEventListener("click", () => startEdit(r.id));
      const delBtn = document.createElement("button");
      delBtn.className = "mini-btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", async () => {
        const target = records.find(x => x.id === r.id);
        if (!target) return;
        const approved = await askConfirmation({
          title: "削除する記録の確認",
          message: "赤く表示された記録を削除します。この操作は元に戻せません。",
          acceptLabel: "この記録を削除",
          oldRecord: target,
          newRecord: null,
          danger: true,
        });
        if (!approved) return;
        const currentIdx = records.findIndex(x => x.id === r.id);
        if (currentIdx < 0) return;
        records.splice(currentIdx, 1);
        saveRecords(records);
        renderHistory();
      });
      actions.append(editBtn, delBtn);
      tdA.appendChild(actions);

      tr.append(tdDate, tdW, tdBP, tdP, tdN, tdA);
      tbody.appendChild(tr);
    }
  }

  // ---------- 書き出し・読み込み ----------
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function today() {
    return localDateValue();
  }

  const dataMsg = document.getElementById("data-msg");

  document.getElementById("export-csv").addEventListener("click", () => {
    const rows = [["日付", "時刻", "体重(kg)", "収縮期1", "拡張期1", "脈拍1", "収縮期2", "拡張期2", "脈拍2", "収縮期平均(mmHg)", "拡張期平均(mmHg)", "脈拍平均", "メモ"]];
    for (const r of sortedRecords()) {
      rows.push([
        r.date, r.time || "",
        r.weight ?? "",
        (r.sys1 ?? r.sys) ?? "", (r.dia1 ?? r.dia) ?? "", (r.pulse1 ?? r.pulse) ?? "",
        r.sys2 ?? "", r.dia2 ?? "", r.pulse2 ?? "",
        r.sys ?? "", r.dia ?? "", r.pulse ?? "",
        '"' + (r.note || "").replace(/"/g, '""') + '"',
      ]);
    }
    // BOM付きでExcelの文字化けを防ぐ
    const csv = "﻿" + rows.map(r => r.join(",")).join("\r\n");
    download("健康記録_" + today() + ".csv", csv, "text/csv");
    dataMsg.textContent = "CSVを書き出しました。";
  });

  document.getElementById("export-json").addEventListener("click", () => {
    download("健康記録バックアップ_" + today() + ".json",
      JSON.stringify({ app: "health-note", version: 1, records: sortedRecords() }, null, 2),
      "application/json");
    dataMsg.textContent = "JSONバックアップを書き出しました。";
  });

  document.getElementById("import-json").addEventListener("change", ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(incoming)) throw new Error("形式が違います");
        ensureRecordIds(incoming.filter(r => r && r.date));
        let added = 0, updated = 0;
        for (const r of incoming) {
          if (!r || !r.date) continue;
          const idx = records.findIndex(x => x.id === r.id);
          if (idx >= 0) { records[idx] = r; updated++; }
          else { records.push(r); added++; }
        }
        saveRecords(records);
        dataMsg.textContent = `読み込みました(追加 ${added} 件・更新 ${updated} 件)。`;
      } catch {
        dataMsg.textContent = "読み込みに失敗しました。このアプリで書き出したJSONファイルを選んでください。";
      }
      ev.target.value = "";
    };
    reader.readAsText(file);
  });

  // ---------- Service Worker ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* http環境では未対応 */ });
  }

  // ---------- 起動 ----------
  resetForm();
  document.querySelector('.range-btn[data-days="30"]').classList.add("active");
  const initialTab = location.hash.slice(1);
  switchTab(panels[initialTab] ? initialTab : (records.length ? "chart" : "input"));

  // ダーク/ライト切替時にグラフの色を引き直す
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!panels.chart.hidden) renderCharts();
  });
})();

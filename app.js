/* ClipFactory browser demo — selection-stage shape of the engine, on a built-in sample.
   No network, no uploads. Word timings are interpolated evenly for the demo;
   the desktop engine uses real ASR word timings plus media signals and QA gates. */
"use strict";

/* Sample transcript: one voice, contiguous sentence-anchored segments. */
const SENTENCES = [
  { start: 0.0, end: 4.2, text: "If you are over fifty and thinking about retirement, this one story could change how you see your savings." },
  { start: 4.2, end: 9.0, text: "A retired teacher from Ohio turned a two hundred dollar monthly habit into financial peace of mind." },
  { start: 9.0, end: 13.5, text: "No lottery win, no inheritance, no risky bets on stocks she did not understand." },
  { start: 13.5, end: 18.8, text: "So how did she do it? It starts with a rule her grandmother taught her in 1974." },
  { start: 18.8, end: 24.0, text: "Pay yourself first, even if it is only a few dollars, before any bill gets your money." },
  { start: 24.0, end: 29.5, text: "She automated it. Every payday, two hundred dollars moved before she could spend it." },
  { start: 29.5, end: 34.0, text: "The second habit was boring on purpose: one low-cost index fund, nothing else." },
  { start: 34.0, end: 39.2, text: "She checked it exactly twice a year, because checking every day makes people panic." },
  { start: 39.2, end: 44.5, text: "Here is the number nobody believes: after twenty years, her statements showed real security." },
  { start: 44.5, end: 49.0, text: "Not because the market was kind, but because she never interrupted compounding." },
  { start: 49.0, end: 54.3, text: "Now compare that to her neighbor, who chased every hot tip and paid the price in fees." },
  { start: 54.3, end: 59.0, text: "Question: how much of your paycheck disappears before you even notice it is gone?" },
  { start: 59.0, end: 64.5, text: "Track it for thirty days. Most people find three subscriptions they forgot they had." },
  { start: 64.5, end: 69.8, text: "Cancel two of them, redirect the money, and you have funded your first habit." },
  { start: 69.8, end: 74.0, text: "The third habit is the hardest: ignore the noise when markets fall ten percent." },
  { start: 74.0, end: 79.5, text: "Falls are the price of admission. Every recovery in history rewarded the patient." },
  { start: 79.5, end: 84.0, text: "She kept a one-page letter to herself for the scary days, and she read it twice." },
  { start: 84.0, end: 89.2, text: "Here is my challenge to you: write your one-page letter before this weekend ends." },
  { start: 89.2, end: 94.0, text: "The fourth habit protects everything: an emergency fund with three months of expenses." },
  { start: 94.0, end: 99.5, text: "Without it, every surprise becomes debt, and debt is the enemy of compounding." },
  { start: 99.5, end: 104.8, text: "Start small. Even five hundred dollars in a separate account changes your decisions." },
  { start: 104.8, end: 110.5, text: "So to recap: automate first, keep it boring, ignore the noise, and protect the base." },
  { start: 110.5, end: 116.0, text: "Do that for a decade and your future self will thank you every single morning." },
];

const NUMBER_RE = /\d|hundred|thousand|million|billion|percent|dollar|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one|two|three|four|five|six|seven|eight|nine/i;
const CTA_RE = /\b(challenge|track|cancel|write|start|automate|protect|ignore|redirect)\b/i;

function scoreSentence(s, index, keywords) {
  const parts = [{ key: "base", pts: 10 }];
  if (index < 2) parts.push({ key: "opening_hook", pts: 6 });
  if (s.text.includes("?")) parts.push({ key: "contains_question", pts: 4 });
  if (NUMBER_RE.test(s.text)) parts.push({ key: "contains_number", pts: 3 });
  const lower = s.text.toLowerCase();
  const hits = keywords.filter((k) => k && lower.includes(k)).slice(0, 3);
  hits.forEach((k) => parts.push({ key: "keyword_match:" + k, pts: 3 }));
  if (CTA_RE.test(s.text)) parts.push({ key: "call_to_action", pts: 2 });
  const total = parts.reduce((a, p) => a + p.pts, 0);
  return { total, parts, hits };
}

function buildCandidates(minD, maxD, keywords) {
  const scored = SENTENCES.map((s, i) => ({ ...s, index: i, ...scoreSentence(s, i, keywords) }));
  const windows = [];
  for (let a = 0; a < scored.length; a++) {
    for (let n = 1; n <= 3 && a + n <= scored.length; n++) {
      const slice = scored.slice(a, a + n);
      const start = slice[0].start;
      const end = slice[slice.length - 1].end;
      const dur = end - start;
      if (dur < minD || dur > maxD) continue;
      const sum = slice.reduce((t, s) => t + s.total, 0);
      const total = sum + 2 * (n - 1); // small arc bonus for multi-sentence clips
      const reasons = ["anchored_to_sentence_boundary"];
      if (a === 0) reasons.push("opening_hook");
      if (slice.some((s) => s.text.includes("?"))) reasons.push("contains_question");
      if (slice.some((s) => NUMBER_RE.test(s.text))) reasons.push("contains_number");
      const kw = [...new Set(slice.flatMap((s) => s.hits))].slice(0, 2);
      kw.forEach((k) => reasons.push("keyword_match:" + k));
      if (n > 1) reasons.push("multi_sentence_arc");
      windows.push({ start, end, dur, total, reasons, sentences: slice });
    }
  }
  windows.sort((x, y) => y.total - x.total || x.start - y.start);
  return windows;
}

function pickNonOverlapping(windows, count) {
  const picked = [];
  for (const w of windows) {
    if (picked.length >= count) break;
    if (picked.some((p) => w.start < p.end && p.start < w.end)) continue;
    picked.push(w);
  }
  return picked.sort((a, b) => b.total - a.total);
}

/* ---- player state ---- */
let current = null; // {clip, words, t, playing, timer}
const $ = (id) => document.getElementById(id);

function wordsFor(clip) {
  const words = [];
  for (const s of clip.sentences) {
    const toks = s.text.split(/\s+/).filter(Boolean);
    const span = s.end - s.start;
    toks.forEach((tok, i) => {
      words.push({
        tok,
        start: s.start + (span * i) / toks.length,
        end: s.start + (span * (i + 1)) / toks.length,
        sentence: s.text,
      });
    });
  }
  return words;
}

function fmt(t) { return t.toFixed(1) + "s"; }

function renderCandidates(picked, maxScore, platform) {
  const box = $("candidates");
  box.innerHTML = "";
  if (!picked.length) {
    box.innerHTML = '<div class="empty">No windows fit that duration range. Widen min/max and try again.</div>';
    return;
  }
  picked.forEach((clip, i) => {
    const el = document.createElement("article");
    el.className = "candidate" + (current && current.clip === clip ? " selected" : "");
    el.innerHTML =
      '<div class="candidate-top"><span class="rank">#' + (i + 1) + "</span>" +
      '<span class="candidate-time">' + fmt(clip.start) + " – " + fmt(clip.end) + "</span>" +
      '<span class="candidate-dur">' + clip.dur.toFixed(1) + "s · " + platform + " 9:16</span></div>" +
      '<div class="scorebar"><span style="width:' + Math.round((100 * clip.total) / maxScore) + '%"></span></div>' +
      '<p class="candidate-text">' + clip.sentences.map((s) => escapeHtml(s.text)).join(" ") + "</p>" +
      '<ul class="reasons">' + clip.reasons.map((r) => "<li>" + escapeHtml(r) + "</li>").join("") + "</ul>" +
      '<div class="candidate-foot"><button class="btn btn-small" type="button">Preview</button>' +
      '<span class="score-num">score ' + clip.total.toFixed(0) + "</span></div>";
    el.querySelector("button").addEventListener("click", () => selectClip(clip, i));
    box.appendChild(el);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function selectClip(clip, rank) {
  stopPlayback();
  current = { clip, rank, words: wordsFor(clip), t: 0, playing: false, timer: null };
  document.querySelectorAll(".candidate").forEach((el, i) => el.classList.toggle("selected", i === rank));
  $("preview-title").textContent =
    "clip-" + String(rank + 1).padStart(3, "0") + " · " + fmt(clip.start) + "–" + fmt(clip.end);
  $("play-btn").disabled = false;
  $("play-btn").textContent = "Play";
  paintFrame();
  renderPlan();
}

function paintFrame() {
  if (!current) return;
  const { clip, words, t } = current;
  const dur = clip.end - clip.start;
  const at = clip.start + t;
  let idx = words.findIndex((w) => at < w.end);
  if (idx < 0) idx = words.length - 1;
  const lo = Math.max(0, idx - 1);
  const main = words.slice(lo, lo + 4).map((w) => w.tok).join(" ");
  $("cap-main").textContent = main || "—";
  $("cap-sub").textContent = words[idx] ? words[idx].sentence.slice(0, 72) : "";
  $("cap-progress").style.width = (100 * t) / dur + "%";
  $("time-label").textContent = t.toFixed(1) + "s / " + dur.toFixed(1) + "s";
  $("scrub").value = String(Math.round((1000 * t) / dur));
}

function renderPlan() {
  if (!current) return;
  const { clip, rank } = current;
  const plan = {
    clip_id: "clip-" + String(rank + 1).padStart(3, "0"),
    command: "clip.batch-select (browser demo)",
    platform: $("platform").value,
    range_s: { start: +clip.start.toFixed(1), end: +clip.end.toFixed(1) },
    duration_s: +clip.dur.toFixed(1),
    score: +clip.total.toFixed(0),
    reasons: clip.reasons,
    sentences: clip.sentences.map((s) => s.text),
    caption_style: "bold_animated",
    render: { canvas: "1080x1920", fps: 30, captions: "burned-in ASS" },
    qa: "not run here — desktop engine gates on black/freeze/silence + caption QA + visual QA",
    verdict: "review_required (a human decides)",
  };
  $("plan-json").textContent = JSON.stringify(plan, null, 2);
}

function stopPlayback() {
  if (current && current.timer) clearInterval(current.timer);
  if (current) { current.timer = null; current.playing = false; }
  $("play-btn").textContent = "Play";
}

function togglePlay() {
  if (!current) return;
  if (current.playing) { stopPlayback(); return; }
  if (current.t >= current.clip.end - current.clip.start - 0.05) current.t = 0;
  current.playing = true;
  $("play-btn").textContent = "Pause";
  current.timer = setInterval(() => {
    current.t += 0.1;
    const dur = current.clip.end - current.clip.start;
    if (current.t >= dur) { current.t = dur; paintFrame(); stopPlayback(); return; }
    paintFrame();
  }, 100);
}

/* ---- wiring ---- */
function readControls() {
  const count = Math.min(4, Math.max(1, parseInt($("target-count").textContent, 10) || 2));
  const keywords = $("keywords").value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  return { count, keywords, minD: +$("min-dur").value, maxD: +$("max-dur").value, platform: $("platform").value };
}

$("run-demo").addEventListener("click", () => {
  stopPlayback();
  current = null;
  $("play-btn").disabled = true;
  const t0 = performance.now();
  const { count, keywords, minD, maxD, platform } = readControls();
  if (minD > maxD) {
    $("demo-stage-label").textContent = "Min must be under max — adjust and retry.";
    return;
  }
  const windows = buildCandidates(minD, maxD, keywords);
  const picked = pickNonOverlapping(windows, count);
  const ms = Math.max(1, Math.round(performance.now() - t0));
  const maxScore = Math.max(...picked.map((p) => p.total), 1);
  renderCandidates(picked, maxScore, platform);
  $("demo-stage-label").textContent =
    picked.length
      ? "Selected " + picked.length + " clip" + (picked.length > 1 ? "s" : "") + " from " + SENTENCES.length + " sentences in " + ms + "ms — in your browser."
      : "No fit — widen the duration range.";
  $("plan-json").textContent = "Select “Preview” on a clip to see its edit plan.";
  $("preview-title").textContent = "no clip selected yet";
  if (picked.length) selectClip(picked[0], 0);
});

$("reset-demo").addEventListener("click", () => {
  stopPlayback();
  current = null;
  $("target-count").textContent = "2";
  $("keywords").value = "retirement, debt, automate";
  $("min-dur").value = "12";
  $("max-dur").value = "45";
  $("platform").value = "tiktok";
  $("candidates").innerHTML = "";
  $("plan-json").textContent = "Run the demo to generate a plan.";
  $("preview-title").textContent = "no clip selected yet";
  $("cap-main").textContent = "Press “Select clips”";
  $("cap-sub").textContent = "your preview plays here";
  $("cap-progress").style.width = "0%";
  $("time-label").textContent = "0.0s / 0.0s";
  $("scrub").value = "0";
  $("play-btn").disabled = true;
  $("demo-stage-label").textContent = "Ready — press “Select clips”.";
});

$("count-minus").addEventListener("click", () => {
  const v = Math.max(1, (parseInt($("target-count").textContent, 10) || 2) - 1);
  $("target-count").textContent = String(v);
});
$("count-plus").addEventListener("click", () => {
  const v = Math.min(4, (parseInt($("target-count").textContent, 10) || 2) + 1);
  $("target-count").textContent = String(v);
});
$("play-btn").addEventListener("click", togglePlay);
$("scrub").addEventListener("input", (e) => {
  if (!current) return;
  const wasPlaying = current.playing;
  stopPlayback();
  const dur = current.clip.end - current.clip.start;
  current.t = (dur * +e.target.value) / 1000;
  paintFrame();
  if (wasPlaying) togglePlay();
});

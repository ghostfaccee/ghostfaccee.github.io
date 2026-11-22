"use strict";

const byId = (id) => document.getElementById(id);
const root = document.documentElement;
const prefersDark = matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function read(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* Хранилище может быть недоступно. */ }
}

// Тема
const themeButton = byId("theme-toggle");
const themeKey = "ghostfaccee:theme";
const savedTheme = read(themeKey) || read("theme");
let theme = ["light", "dark"].includes(savedTheme) ? savedTheme : null;

function applyTheme() {
  const dark = theme ? theme === "dark" : prefersDark.matches;
  root.dataset.theme = dark ? "dark" : "light";
  themeButton.setAttribute("aria-pressed", String(dark));
}

applyTheme();
themeButton.hidden = false;
prefersDark.addEventListener("change", applyTheme);
themeButton.addEventListener("click", () => {
  theme = root.dataset.theme === "dark" ? "light" : "dark";
  save(themeKey, theme);
  applyTheme();
});

// Аватар
const portrait = byId("portrait");
const hideBrokenPortrait = () => { portrait.hidden = true; };
portrait.addEventListener("error", hideBrokenPortrait);
if (portrait.complete && !portrait.naturalWidth) hideBrokenPortrait();

// Карусель технологий
const strip = document.querySelector(".tech-strip");
const viewport = byId("tech-viewport");
const track = byId("tech-track");
const technologyList = track.querySelector(".tech-list");
const clone = technologyList.cloneNode(true);
const stripToggle = byId("strip-toggle");
const pauseKey = "ln:tech-paused";
let paused = read(pauseKey) === "true";

clone.classList.add("tech-clone");
clone.setAttribute("aria-hidden", "true");
track.append(clone);

function updatePause() {
  strip.classList.toggle("is-paused", paused);
  stripToggle.setAttribute(
    "aria-label",
    paused ? "Возобновить ленту технологий" : "Приостановить ленту технологий"
  );
}

function updateStrip() {
  const animate = !reducedMotion.matches;
  strip.classList.toggle("is-looping", animate);
  stripToggle.hidden = !animate;

  if (animate) {
    const width = technologyList.getBoundingClientRect().width;
    track.style.setProperty("--loop-time", `${Math.max(32, width / 32)}s`);
  }
}

stripToggle.addEventListener("click", () => {
  paused = !paused;
  updatePause();
  save(pauseKey, String(paused));
});

updatePause();
updateStrip();
reducedMotion.addEventListener("change", updateStrip);

if ("ResizeObserver" in window) {
  new ResizeObserver(updateStrip).observe(viewport);
} else {
  window.addEventListener("resize", updateStrip);
}

document.fonts?.ready.then(updateStrip);

// Появление секций
if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("has-entered");
      observer.unobserve(entry.target);
    }
  }, { threshold: .12 });

  document.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
}

// Поиск, фильтр и сортировка проектов
const projectList = byId("project-list");
const query = byId("project-query");
const filter = byId("project-filter");
const sort = byId("project-sort");
const count = byId("project-count");
const empty = byId("project-empty");
const collator = new Intl.Collator(["en", "ru"], { sensitivity: "base", numeric: true });

const normalize = (text) => text
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[\s\p{Pd}]+/gu, " ")
  .trim();

const projects = Array.from(projectList.children, (node) => ({
  node,
  title: node.querySelector("h3").textContent.trim(),
  categories: node.dataset.category.split(/\s+/),
  search: normalize([...node.querySelectorAll("h3, p, .tags li")]
    .map((element) => element.textContent).join(" "))
}));

function sortProjects() {
  const ordered = [...projects];

  if (sort.value !== "default") {
    const direction = sort.value === "desc" ? -1 : 1;
    ordered.sort((a, b) => direction * collator.compare(a.title, b.title));
  }

  projectList.append(...ordered.map(({ node }) => node));
}

function filterProjects() {
  const words = normalize(query.value).split(" ").filter(Boolean);
  let visible = 0;

  for (const project of projects) {
    const matchesCategory = filter.value === "all" || project.categories.includes(filter.value);
    const matchesSearch = words.every((word) => project.search.includes(word));
    project.node.hidden = !(matchesCategory && matchesSearch);
    if (!project.node.hidden) visible++;
  }

  empty.hidden = visible !== 0;
  count.textContent = `Показано: ${visible} из ${projects.length}`;
}

query.addEventListener("input", filterProjects);
filter.addEventListener("change", filterProjects);
sort.addEventListener("change", sortProjects);
window.addEventListener("pageshow", () => {
  sortProjects();
  filterProjects();
});
filterProjects();
byId("project-tools").hidden = false;

// Копирование почты
const copyButton = byId("copy-email");
const copyStatus = byId("copy-status");

if (navigator.clipboard?.writeText) {
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    const address = byId("email").getAttribute("href").slice("mailto:".length);

    try {
      await navigator.clipboard.writeText(address);
      copyStatus.textContent = "Адрес скопирован.";
    } catch {
      copyStatus.textContent = `Не удалось скопировать. Почта: ${address}`;
    }
  });
}

// Ping
const ping = byId("ping");
const pingButton = byId("ping-button");
const pingStatus = byId("ping-status");
const pingBest = byId("ping-best");
const bestKey = "ln:ping-best";
let best = Number(read(bestKey)) || 0;
let phase = "idle";
let pingTimer = 0;
let pingFrame = 0;
let signalAt = 0;

function showBest() {
  pingBest.textContent = best > 0 ? `Лучший результат: ${best} мс` : "";
}

function resetPing(label = "Начать", message = "") {
  clearTimeout(pingTimer);
  cancelAnimationFrame(pingFrame);
  phase = "idle";
  pingButton.classList.remove("is-ready");
  pingButton.textContent = label;
  pingStatus.textContent = message;
}

pingButton.addEventListener("click", () => {
  if (phase === "waiting" || phase === "arming") {
    resetPing("Попробовать снова", "Слишком рано. Дождись сигнала.");
    return;
  }

  if (phase === "ready") {
    const result = Math.max(1, Math.round(performance.now() - signalAt));

    if (!best || result < best) {
      best = result;
      save(bestKey, String(best));
      showBest();
      resetPing("Ещё раунд", `${result} мс. Новый рекорд!`);
    } else {
      resetPing("Ещё раунд", `Результат: ${result} мс.`);
    }
    return;
  }

  phase = "waiting";
  pingButton.textContent = "Жди…";
  pingStatus.textContent = "";

  pingTimer = setTimeout(() => {
    if (document.hidden || !ping.open) {
      resetPing();
      return;
    }

    phase = "arming";
    pingFrame = requestAnimationFrame(() => {
      signalAt = performance.now();
      phase = "ready";
      pingButton.textContent = "Жми!";
      pingButton.classList.add("is-ready");
      pingStatus.textContent = "Жми!";
    });
  }, 1100 + Math.random() * 2500);
});

ping.addEventListener("toggle", () => {
  if (!ping.open) resetPing();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase !== "idle") resetPing("Начать", "Раунд сброшен.");
});

showBest();
ping.hidden = false;

// Фоновая сеть: видна в покое, реагирует только на ближайший курсор.
function mountGraph() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.className = "graph-background";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const finePointer = matchMedia("(any-hover: hover) and (any-pointer: fine)");
  const pointer = { x: 0, y: 0, active: false };
  const pointerRadius = 250;
  const nodePull = .53;

  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let nodes = [];
  let edges = [];
  let sizeDirty = true;
  let frame = null;
  let lastTime = 0;

  function canFollowPointer() {
    return finePointer.matches && !reducedMotion.matches;
  }

  function rebuild() {
    sizeDirty = false;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (w === width && h === height && dpr === pixelRatio) return;

    width = w;
    height = h;
    pixelRatio = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    // Мелкая сетка с разбросом: фон плотный, но не похож на миллиметровку.
    const cell = Math.max(width < 600 ? 56 : 72, Math.sqrt(width * height / 300));
    const cols = Math.max(1, Math.round(width / cell));
    const rows = Math.max(1, Math.round(height / cell));
    const dx = width / cols;
    const dy = height / rows;
    const edgeRange = Math.max(110, Math.hypot(dx, dy) * 1.28);

    let seed = 173;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    nodes = [];
    edges = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col + .16 + random() * .68) * dx;
        const y = (row + .16 + random() * .68) * dy;
        const hub = random() < .17;
        nodes.push({
          x, y,
          homeX: x,
          homeY: y,
          hub,
          size: hub ? 2.5 + random() * .6 : 1.45 + random() * .65,
          focus: 0
        });
      }
    }

    // Связи фиксируются при изменении размера и не мигают при движении.
    const seen = new Set();

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const nearby = [];

      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const b = nodes[j];
        const distance = Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY);
        if (distance < edgeRange) nearby.push({ j, distance });
      }

      nearby.sort((a, b) => a.distance - b.distance);

      for (const { j, distance } of nearby.slice(0, a.hub ? 6 : 4)) {
        const key = Math.min(i, j) * nodes.length + Math.max(i, j);
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a, b: nodes[j], strength: 1 - distance / edgeRange });
      }
    }
  }

  function requestDraw() {
    if (frame === null && !document.hidden) {
      frame = requestAnimationFrame(draw);
    }
  }

  function draw(now) {
    frame = null;
    if (sizeDirty) rebuild();

    const dark = root.dataset.theme === "dark";
    const follow = canFollowPointer();
    const dt = lastTime ? Math.min(50, now - lastTime) : 16.67;
    const ease = follow ? 1 - Math.exp(-dt / 85) : 1;
    let moving = false;

    for (const node of nodes) {
      let tx = node.homeX;
      let ty = node.homeY;
      let focus = 0;

      if (follow && pointer.active) {
        const dx = pointer.x - node.homeX;
        const dy = pointer.y - node.homeY;
        focus = Math.max(0, 1 - Math.hypot(dx, dy) / pointerRadius);
        tx += dx * focus * nodePull;
        ty += dy * focus * nodePull;
      }

      const settled = Math.abs(tx - node.x) + Math.abs(ty - node.y) < .15
        && Math.abs(focus - node.focus) < .005;

      if (settled || ease === 1) {
        node.x = tx;
        node.y = ty;
        node.focus = focus;
      } else {
        node.x += (tx - node.x) * ease;
        node.y += (ty - node.y) * ease;
        node.focus += (focus - node.focus) * ease;
        moving = true;
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = ctx.fillStyle = dark ? "#e9e9f2" : "#292932";
    ctx.lineWidth = 1.15;

    for (const { a, b, strength } of edges) {
      ctx.globalAlpha = (dark ? .21 : .19)
        + .17 * strength + .32 * Math.max(a.focus, b.focus);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const node of nodes) {
      ctx.globalAlpha = (dark ? .47 : .42) + (node.hub ? .17 : 0) + .28 * node.focus;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size + .85 * node.focus, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    lastTime = moving ? now : 0;
    if (moving) requestDraw();
  }

  function clearPointer() {
    pointer.active = false;
    requestDraw();
  }

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || !canFollowPointer()) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    requestDraw();
  }, { passive: true });

  root.addEventListener("pointerleave", clearPointer);
  window.addEventListener("blur", clearPointer);
  finePointer.addEventListener("change", clearPointer);
  reducedMotion.addEventListener("change", clearPointer);

  window.addEventListener("resize", () => {
    sizeDirty = true;
    clearPointer();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = 0;
      pointer.active = false;
    } else {
      sizeDirty = true;
      requestDraw();
    }
  });

  new MutationObserver(requestDraw).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  requestDraw();
}

mountGraph();

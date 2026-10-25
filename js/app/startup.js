/* Startup: gestures, routing, lifecycle */
import { render, rootView } from "./shell.js";
import { clone } from "../core/constants.js";
import { D, U } from "../core/state.js";
import { handleImport } from "../data/import-export.js";
import { addDays, backup, cat, dateObj, iso } from "../domain/finance.js";
import { categoryActions } from "../screens/categories.js";
import { back, close, home, info } from "../ui/kit.js";
import {
  actions,
  counter,
  inputs,
  locked,
  photoCallback,
  pinEntry,
  setActions,
  setCounter,
  setInputs,
  setLocked,
  setPinEntry,
  toast,
} from "../ui/primitives.js";

export function startup() {
  let heldTimer = null,
    skipClick = false,
    hiddenAt = 0;
  // One gesture recognizer shared by all four root sections.
  // Buttons inside the scrollable content no longer suppress a swipe; controls in sheets do.
  let rootSwipe = null,
    swipeSuppressClickUntil = 0;
  const swipeEase = "cubic-bezier(.22,1,.36,1)";
  function swipeSurface() {
    return document.querySelector("#base>.swipe-pane");
  }
  function swipeTabs() {
    return D.accounts.some((a) => !a.archived && a.type === "Debt")
      ? ["Accounts", "Debts", "Total"]
      : ["Accounts", "Total"];
  }
  function swipeEdge(direction) {
    if (U.tab === "accounts") {
      const tabs = swipeTabs();
      return (
        tabs.indexOf(U.accountTab) + direction < 0 ||
        tabs.indexOf(U.accountTab) + direction >= tabs.length
      );
    }
    return U.period.mode === "all";
  }
  function swipeAdvanceState(direction) {
    if (U.tab === "accounts") {
      const tabs = swipeTabs(),
        idx = tabs.indexOf(U.accountTab) + direction;
      if (idx < 0 || idx >= tabs.length) return false;
      U.accountTab = tabs[idx];
      return true;
    }
    if (U.period.mode === "all") return false;
    const p = U.period;
    if (p.mode === "range") {
      const days = Math.round((dateObj(p.to) - dateObj(p.from)) / 86400000) + 1;
      p.from = addDays(p.from, direction * days);
      p.to = addDays(p.to, direction * days);
    } else if (p.mode === "month" || p.mode === "year") {
      let d = dateObj(p.anchor);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction * (p.mode === "year" ? 12 : 1));
      p.anchor = iso(d);
    } else p.anchor = addDays(p.anchor, direction * (p.mode === "week" ? 7 : 1));
    U.donut = null;
    return true;
  }
  function swipePreview(direction) {
    const prior = {
        accountTab: U.accountTab,
        period: clone(U.period),
        donut: U.donut,
      },
      priorActions = actions,
      priorInputs = inputs,
      priorCounter = counter;
    let node = null;
    try {
      if (!swipeAdvanceState(direction)) return null;
      setActions({});
      setInputs({});
      setCounter(0);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = rootView();
      node = wrapper.querySelector(".swipe-pane");
      if (node) {
        node.querySelectorAll(".fab,.mon-period-arrows").forEach((e) => e.remove());
        node.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
        node.setAttribute("aria-hidden", "true");
        node.setAttribute("inert", "");
      }
    } finally {
      U.accountTab = prior.accountTab;
      U.period = prior.period;
      U.donut = prior.donut;
      setActions(priorActions);
      setInputs(priorInputs);
      setCounter(priorCounter);
    }
    return node;
  }
  function swipeCleanup(s) {
    if (!s) return;
    if (s.viewport?.isConnected) s.viewport.remove();
    else if (s.track?.isConnected) s.track.remove();
    const underline = document.querySelector("#base>.account-tabs .mon-tabs-progress");
    if (underline) {
      const tabs = underline.parentElement,
        active = tabs.querySelector("button.active");
      if (active) {
        const tr = tabs.getBoundingClientRect(),
          ar = active.getBoundingClientRect();
        underline.style.width = ar.width + "px";
        underline.style.transform = "translate3d(" + (ar.left - tr.left) + "px,0,0)";
      }
    }
    if (s.el) {
      s.el.style.transform = "";
      s.el.style.opacity = "";
      s.el.style.willChange = "";
      s.el.style.visibility = "";
    }
  }
  function swipePrepare(s, direction) {
    if (s.direction === direction) return;
    if (s.track) s.track.remove();
    s.track = null;
    s.direction = direction;
    s.neighbor = null;
    if (swipeEdge(direction)) return;
    const node = swipePreview(direction);
    if (!node) return;
    // A fixed, clipped overlay is independent of #base's flex layout. It cannot
    // displace the hero, the bottom navbar, or change the height of the content.
    const rect = s.el.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return;
    const viewport = document.createElement("div");
    viewport.className = "mon-pager-viewport";
    viewport.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-height:${rect.height}px`;
    const track = document.createElement("div");
    track.className = "mon-swipe-track";
    const current = s.el.cloneNode(true);
    current.querySelectorAll(".fab,.mon-period-arrows").forEach((e) => e.remove());
    current.classList.add("mon-swipe-page");
    current.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
    current.setAttribute("inert", "");
    node.classList.add("mon-swipe-page");
    if (direction === 1) track.append(current, node);
    else track.append(node, current);
    viewport.append(track);
    document.body.append(viewport);
    track.style.width = rect.width * 2 + "px";
    for (const page of [current, node]) {
      page.style.flex = "0 0 " + rect.width + "px";
      page.style.width = rect.width + "px";
      page.style.maxWidth = rect.width + "px";
      page.style.height = rect.height + "px";
    }
    s.viewport = viewport;
    s.track = track;
    s.neighbor = node;
    s.current = current;
    s.width = rect.width;
    const content = s.el.querySelector(".content");
    if (content) {
      const cloneContent = current.querySelector(".content");
      if (cloneContent) cloneContent.scrollTop = content.scrollTop;
      const neighborContent = node.querySelector(".content");
      if (neighborContent) neighborContent.scrollTop = content.scrollTop;
    }
    if (U.tab === "categories") {
      const originalGrid = s.el.querySelector(".grid"),
        previewGrid = current.querySelector(".grid"),
        nextGrid = node.querySelector(".grid");
      if (originalGrid) {
        const originalRect = originalGrid.getBoundingClientRect(),
          gridStyle = getComputedStyle(originalGrid);
        const sourceTiles = [...originalGrid.children];
        for (const g of [previewGrid, nextGrid])
          if (g) {
            g.style.gridTemplateColumns = gridStyle.gridTemplateColumns;
            g.style.columnGap = gridStyle.columnGap;
            g.style.rowGap = gridStyle.rowGap;
            g.style.width = originalRect.width + "px";
            g.style.minWidth = originalRect.width + "px";
            g.style.maxWidth = originalRect.width + "px";
            for (const tile of g.children) {
              tile.style.minHeight = "0";
              tile.style.flexShrink = "0";
            }
          }
        // Preserve source tile geometry on both neighboring pages, including box sizing.
        // Do not mix the source page's fixed heights with the neighbor's auto heights.
        for (const g of [previewGrid, nextGrid])
          if (g) {
            for (const tile of g.children) {
              const template =
                sourceTiles[Math.min([...g.children].indexOf(tile), sourceTiles.length - 1)];
              if (!template) continue;
              const tr = template.getBoundingClientRect(),
                cs = getComputedStyle(template);
              tile.style.boxSizing = "border-box";
              tile.style.minHeight = tr.height + "px";
              tile.style.height = tr.height + "px";
              tile.style.padding = cs.padding;
              tile.style.borderWidth = cs.borderWidth;
            }
          }
      }
    }
    // The preview must never inherit viewport percentage widths that differ from the source page.
    for (const pg of [current, node]) {
      pg.style.setProperty("min-width", rect.width + "px", "important");
      pg.style.setProperty("max-width", rect.width + "px", "important");
    }
    s.el.style.opacity = "0";
  }
  function swipeMove(s, dx) {
    if (!s.el) return;
    const direction = dx < 0 ? 1 : -1;
    swipePrepare(s, direction);
    const width = s.width || s.el.getBoundingClientRect().width || innerWidth;
    if (U.tab === "accounts") {
      const tabs = document.querySelector("#base>.account-tabs");
      if (tabs) {
        const buttons = [...tabs.querySelectorAll("button")];
        const active = buttons.findIndex((b) => b.classList.contains("active"));
        const next = active + direction;
        const underline = tabs.querySelector(".mon-tabs-progress");
        if (underline && active >= 0) {
          const fraction =
            next >= 0 && next < buttons.length
              ? Math.max(0, Math.min(1, Math.abs(dx) / (s.width || innerWidth)))
              : 0;
          const from = buttons[active],
            to = buttons[next] || from;
          underline.style.transition = "none";
          const tr = tabs.getBoundingClientRect(),
            fr = from.getBoundingClientRect(),
            nr = to.getBoundingClientRect();
          underline.style.width = fr.width + (nr.width - fr.width) * fraction + "px";
          underline.style.transform =
            "translate3d(" + (fr.left - tr.left + (nr.left - fr.left) * fraction) + "px,0,0)";
        }
      }
    }
    if (s.track) {
      const x =
        direction === 1 ? Math.max(-width, Math.min(0, dx)) : Math.min(width, Math.max(0, dx));
      s.track.style.transform = `translate3d(${direction === 1 ? x : x - width}px,0,0)`;
    } else {
      const elastic = Math.sign(dx) * Math.min(28, 28 * (1 - Math.exp(-Math.abs(dx) / 95)));
      s.el.style.transform = `translate3d(${elastic}px,0,0)`;
    }
  }
  function swipeFinish(s, commit) {
    if (!s?.el) return;
    const reduce =
      window.__MONIVRA_TEST__ || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!s.track) {
      const old = s.el.style.transform;
      s.el.style.transform = "";
      if (!reduce && old && s.el.animate)
        s.el.animate([{ transform: old }, { transform: "translate3d(0,0,0)" }], {
          duration: 250,
          easing: swipeEase,
        });
      swipeCleanup(s);
      return;
    }
    const width = s.width || innerWidth;
    const from = new DOMMatrix(getComputedStyle(s.track).transform).m41;
    const to = commit ? (s.direction === 1 ? -width : 0) : s.direction === 1 ? 0 : -width;
    const dist = Math.abs(to - from),
      duration = reduce ? 0 : Math.max(145, Math.min(360, (dist / width) * 330 + 105));
    const track = s.track;
    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      // Render the destination underneath the overlay BEFORE removing it.
      // This avoids the flash of the old page / disappearing fixed elements.
      if (commit) {
        swipeAdvanceState(s.direction);
        render();
      }
      swipeCleanup(s);
    };
    if (!duration) {
      finalize();
      return;
    }
    const animation = track.animate(
      [{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }],
      { duration, easing: swipeEase, fill: "forwards" },
    );
    animation.onfinish = finalize;
    animation.oncancel = finalize;
  }
  document.addEventListener(
    "touchstart",
    (e) => {
      if (
        e.touches.length !== 1 ||
        U.pages.length ||
        U.layers.length ||
        !["accounts", "categories", "operations", "statistics"].includes(U.tab)
      )
        return;
      if (e.target.closest(".navbar,.overlay,input,textarea,select,[contenteditable],.hero-action"))
        return;
      const t = e.touches[0];
      rootSwipe = {
        x: t.clientX,
        y: t.clientY,
        tab: U.tab,
        at: performance.now(),
        el: swipeSurface(),
        axis: null,
        direction: 0,
        track: null,
        lastDx: 0,
      };
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      const s = rootSwipe;
      if (!s || e.touches.length !== 1 || U.tab !== s.tab) return;
      const t = e.touches[0],
        dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 9)
        s.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      if (s.axis !== "x" || !s.el) return;
      s.lastDx = dx;
      swipeMove(s, dx);
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      const s = rootSwipe;
      rootSwipe = null;
      if (!s) return;
      if (U.pages.length || U.layers.length || U.tab !== s.tab || e.changedTouches.length !== 1) {
        swipeFinish(s, false);
        return;
      }
      const t = e.changedTouches[0],
        dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      if (s.axis !== "x") {
        swipeCleanup(s);
        return;
      }
      swipeSuppressClickUntil = Date.now() + 420;
      const width = s.width || s.el?.getBoundingClientRect().width || innerWidth;
      const commit =
        !!s.track && Math.abs(dx) > Math.max(48, width * 0.27) && Math.abs(dx) > Math.abs(dy) * 1.1;
      swipeFinish(s, commit);
    },
    { passive: true },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      const s = rootSwipe;
      rootSwipe = null;
      swipeFinish(s, false);
    },
    { passive: true },
  );
  document.addEventListener("click", (event) => {
    if (Date.now() < swipeSuppressClickUntil) {
      event.preventDefault();
      return;
    }
    if (skipClick) {
      skipClick = false;
      return;
    }
    const target = event.target.closest("[data-action]");
    if (target) {
      const fn = actions[target.dataset.action];
      if (fn)
        try {
          fn();
        } catch (e) {
          toast(e.message);
          console.error(e);
        }
    } else if (
      event.target.classList.contains("overlay") &&
      Number(event.target.dataset.layer) === U.layers.length - 1
    )
      close();
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("input:not([type=checkbox]):not([type=radio]),textarea"))
      inputs[e.target.dataset.input]?.(e.target.value);
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("select,input[type=checkbox],input[type=radio]"))
      inputs[e.target.dataset.input]?.(
        e.target.type === "checkbox" ? e.target.checked : e.target.value,
      );
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      back();
      e.preventDefault();
    }
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.tagName.toLowerCase() === "circle" &&
      e.target.dataset.action
    ) {
      actions[e.target.dataset.action]?.();
      e.preventDefault();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    let target = e.target.closest("[data-category]");
    if (U.tab === "operations") return;
    if (target && !U.pages.length) {
      heldTimer = setTimeout(() => {
        skipClick = true;
        if (target.dataset.category) {
          const c = cat(target.dataset.category);
          if (c) categoryActions(c);
        } else {
          U.selection = true;
          U.selected = [target.dataset.operation];
          render();
        }
      }, 550);
    }
  });
  for (const ev of ["pointerup", "pointercancel", "pointermove"])
    document.addEventListener(ev, () => clearTimeout(heldTimer));
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 20 * 1024 * 1024)
      return info("The file is larger than the 20 MB import limit.", "Import failed");
    try {
      handleImport(await file.text());
    } catch (error) {
      info(error.message, "Import failed");
      console.error("Import failed:", error);
    }
  });
  document.getElementById("photo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast("Choose an image");
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 800 / Math.max(image.width, image.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        photoCallback?.(canvas.toDataURL("image/jpeg", 0.75));
      };
      image.onerror = () => toast("This image could not be opened");
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (D.settings.hidePreview) document.getElementById("app").style.visibility = "hidden";
    } else {
      document.getElementById("app").style.visibility = "";
      if (
        D.settings.pin &&
        D.settings.relock &&
        (Date.now() - hiddenAt) / 1000 >= Number(D.settings.lockDelay)
      ) {
        setLocked(true);
        setPinEntry("");
        render();
      }
    }
  });
  try {
    history.pushState({ Monivra: true }, "");
    window.addEventListener("popstate", () => {
      if (U.pages.length || U.layers.length || U.tab !== "accounts" || U.selection || U.search) {
        back();
        history.pushState({ Monivra: true }, "");
      }
    });
  } catch {}
  if (
    D.settings.autoBackup &&
    !D.backups.some((b) => b.at.slice(0, 10) === new Date().toISOString().slice(0, 10))
  )
    backup();
  if (D.settings.pin) setLocked(true);
  const routeHash = () => {
    const tab = location.hash.slice(1);
    if (["accounts", "categories", "operations", "statistics", "more"].includes(tab)) home(tab);
  };
  window.addEventListener("hashchange", routeHash);
  routeHash();
  render();
}

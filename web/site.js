/**
 * Full Snap site — Clico-style interactions (vanilla JS).
 * Rotating hero, feature tabs, FAQ accordion, mobile menu, scroll reveals.
 */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    initMobileMenu();
    initSmoothAnchors();
    initRotate();
    initHowTabs();
    initFaq();
    initReveals();
  });

  /* ─── Mobile menu ─── */
  function initMobileMenu() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var menu = document.querySelector("[data-mobile-menu]");
    if (!toggle || !menu) return;

    function setOpen(open) {
      if (open) {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-open");
      } else {
        menu.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(menu.hidden);
    });

    menu.querySelectorAll("[data-menu-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 900) setOpen(false);
    });
  }

  /* ─── Smooth anchors ─── */
  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (!id || id.length < 2) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({
          top: top,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      });
    });
  }

  /* ─── Hero rotate ─── */
  function initRotate() {
    var wrap = document.querySelector("[data-rotate]");
    if (!wrap) return;
    var items = Array.prototype.slice.call(
      wrap.querySelectorAll(".rotate-item")
    );
    if (!items.length) return;

    var i = 0;

    function paint(el) {
      var color = el.getAttribute("data-color");
      if (color) el.style.color = color;
    }

    items.forEach(function (el, idx) {
      paint(el);
      el.classList.toggle("is-active", idx === 0);
    });

    if (reduceMotion || items.length < 2) return;

    setInterval(function () {
      items[i].classList.remove("is-active");
      i = (i + 1) % items.length;
      items[i].classList.add("is-active");
    }, 2200);
  }

  /* ─── How tabs ─── */
  function initHowTabs() {
    var items = Array.prototype.slice.call(
      document.querySelectorAll(".how-item[data-how]")
    );
    var panels = Array.prototype.slice.call(
      document.querySelectorAll("[data-how-panel]")
    );
    var urlEl = document.querySelector("[data-how-url]");
    var mobileCopy = document.querySelector("[data-how-mobile-copy]");
    if (!items.length) return;

    var urls = [
      "example.com/docs/long-page",
      "example.com/design#annotate",
      "download · full-snap-page.png",
      "notion.so · github.com · figma.com",
      "chrome.storage.session · local only",
      "capture → mark → download",
    ];

    var copies = items.map(function (btn) {
      var span = btn.querySelector(".how-copy span");
      return span ? span.textContent : "";
    });

    var auto = null;
    var index = 0;

    function setActive(next) {
      index = next;
      items.forEach(function (btn, i) {
        var on = i === next;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach(function (panel) {
        var id = panel.getAttribute("data-how-panel");
        panel.classList.toggle("is-active", String(next) === id);
      });
      if (urlEl && urls[next]) urlEl.textContent = urls[next];
      if (mobileCopy && copies[next]) mobileCopy.textContent = copies[next];
    }

    function startAuto() {
      if (reduceMotion || items.length < 2) return;
      stopAuto();
      auto = setInterval(function () {
        setActive((index + 1) % items.length);
      }, 3800);
    }

    function stopAuto() {
      if (auto) {
        clearInterval(auto);
        auto = null;
      }
    }

    items.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        setActive(i);
        startAuto();
      });
      btn.addEventListener("mouseenter", stopAuto);
      btn.addEventListener("mouseleave", startAuto);
      btn.addEventListener("focus", stopAuto);
      btn.addEventListener("blur", startAuto);
    });

    // Mobile: swipe/tap stage advances
    var stage = document.querySelector(".how-stage");
    if (stage && window.matchMedia("(max-width: 899px)").matches) {
      stage.addEventListener("click", function () {
        setActive((index + 1) % items.length);
        startAuto();
      });
    }

    setActive(0);
    startAuto();
  }

  /* ─── FAQ ─── */
  function initFaq() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var btn = item.querySelector(".faq-q");
      var panel = item.querySelector(".faq-a");
      if (!btn || !panel) return;

      btn.addEventListener("click", function () {
        var open = item.classList.contains("is-open");

        // close others (accordion)
        document.querySelectorAll(".faq-item.is-open").forEach(function (other) {
          if (other === item) return;
          other.classList.remove("is-open");
          var ob = other.querySelector(".faq-q");
          if (ob) ob.setAttribute("aria-expanded", "false");
        });

        item.classList.toggle("is-open", !open);
        btn.setAttribute("aria-expanded", open ? "false" : "true");
      });
    });
  }

  /* ─── Scroll reveals ─── */
  function initReveals() {
    var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!els.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    els.forEach(function (el, i) {
      // small stagger via delay for sibling groups
      if (!el.style.transitionDelay) {
        el.style.transitionDelay = Math.min(i % 6, 5) * 60 + "ms";
      }
      io.observe(el);
    });

    // hero items in view immediately
    requestAnimationFrame(function () {
      document.querySelectorAll(".hero .reveal").forEach(function (el) {
        el.classList.add("is-in");
      });
    });
  }
})();

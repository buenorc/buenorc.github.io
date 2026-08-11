/*
Site: Limnotronic
File: modern.js

Adds the behaviour the refreshed layout needs, without touching the legacy
jQuery plugins (superfish, flexslider, prettyPhoto) that still run this page:
  1. Off-canvas drawer navigation, replacing the old <select> jump menu.
  2. Back-to-top button.
  3. Horizontal scroll wrappers for wide tables.

Vanilla JS, safe to load with `defer`.
*/
(function () {
  'use strict';

  var BREAKPOINT = 900; /* keep in sync with modern.css */

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function initNav() {
    var header = document.getElementById('header');
    var menu = header && header.querySelector('.mainmenu');
    if (!header || !menu) return;

    var shell = header.querySelector('.container') || header;

    /* Retire the legacy jump-menu <select>. */
    var legacy = document.getElementById('responsive-menu');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);

    if (!menu.id) menu.id = 'lt-mainmenu';
    menu.setAttribute('aria-label', 'Main');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lt-nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', menu.id);
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.innerHTML =
      '<span class="lt-bars" aria-hidden="true"></span>' +
      '<span class="lt-nav-label">Menu</span>';
    shell.insertBefore(toggle, menu);

    var head = document.createElement('div');
    head.className = 'lt-drawer-head';
    head.innerHTML = '<span class="lt-drawer-title">Menu</span>';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'lt-nav-close';
    close.setAttribute('aria-label', 'Close menu');
    close.innerHTML = '<span aria-hidden="true">&times;</span>';
    head.appendChild(close);
    menu.insertBefore(head, menu.firstChild);

    var scrim = document.createElement('div');
    scrim.className = 'lt-scrim';
    document.body.appendChild(scrim);

    function isOpen() {
      return document.body.classList.contains('lt-nav-open');
    }
    function setOpen(open) {
      document.body.classList.toggle('lt-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.documentElement.style.overflow = open ? 'hidden' : '';
    }

    toggle.addEventListener('click', function () { setOpen(!isOpen()); });
    close.addEventListener('click', function () { setOpen(false); toggle.focus(); });
    scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
    });
    menu.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a') : null;
      if (link && menu.contains(link)) setOpen(false);
    });

    var timer;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (window.innerWidth > BREAKPOINT && isOpen()) setOpen(false);
      }, 150);
    });
  }

  function initBackToTop() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'lt-backtotop';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<i class="fa fa-chevron-up" aria-hidden="true"></i>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    var ticking = false;
    function update() {
      btn.classList.toggle('visible', window.pageYOffset > 250);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function initTables() {
    Array.prototype.forEach.call(document.querySelectorAll('table'), function (table) {
      var parent = table.parentNode;
      if (!parent || !parent.classList) return;
      if (parent.classList.contains('lt-table-scroll') || parent.classList.contains('scrollable')) return;
      var wrap = document.createElement('div');
      wrap.className = 'lt-table-scroll';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Scrollable table');
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  ready(function () {
    initNav();
    initBackToTop();
    initTables();
  });
})();

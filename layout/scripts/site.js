/*
Site: de Carvalho Bueno — personal / academic site
File: site.js

Replaces the old jQuery bundle (jquery.min + backtotop + mobilemenu +
placeholder). Vanilla JS, no dependencies, safe to load with `defer`.

Responsibilities:
  1. Off-canvas drawer navigation on small screens (the old <select> menu was
     both dated and, because every sub-page pointed at a non-existent script
     path, completely absent on mobile).
  2. Accordion sub-menus inside the drawer.
  3. Back-to-top button.
  4. Horizontal scroll containers for wide tables.
*/
(function () {
  'use strict';

  var DRAWER_BREAKPOINT = 1000; /* keep in sync with layout.css */

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ---------------------------------------------------------------- nav */
  function initNav() {
    var header = document.getElementById('header');
    var nav = document.getElementById('mainav');
    if (!header || !nav) return;

    /* The template shipped a jQuery-generated <select> fallback; drop it. */
    var legacyForm = nav.querySelector('form');
    if (legacyForm) legacyForm.parentNode.removeChild(legacyForm);

    if (!nav.id) nav.id = 'mainav';
    nav.setAttribute('aria-label', 'Main');

    /* Toggle button */
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.innerHTML =
      '<span class="nav-toggle__bars" aria-hidden="true"></span>' +
      '<span class="nav-toggle__label">Menu</span>';
    header.insertBefore(toggle, nav);

    /* Drawer header — on small screens the hamburger sits underneath the
       open panel, so the drawer needs its own close affordance. */
    var drawerHead = document.createElement('div');
    drawerHead.className = 'nav-drawer-head';
    drawerHead.innerHTML = '<span class="nav-drawer-title">Menu</span>';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'nav-close';
    close.setAttribute('aria-label', 'Close menu');
    close.innerHTML = '<span aria-hidden="true">&times;</span>';
    drawerHead.appendChild(close);
    nav.insertBefore(drawerHead, nav.firstChild);

    /* Backdrop */
    var scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    scrim.setAttribute('hidden', '');
    document.body.appendChild(scrim);
    scrim.removeAttribute('hidden');

    function isOpen() {
      return document.body.classList.contains('nav-open');
    }

    function setOpen(open) {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      /* Stop the page behind the drawer from scrolling. */
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (open) {
        var firstLink = nav.querySelector('a');
        if (firstLink) firstLink.focus({ preventScroll: true });
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });
    scrim.addEventListener('click', function () {
      setOpen(false);
    });
    close.addEventListener('click', function () {
      setOpen(false);
      toggle.focus();
    });
    /* Following a link should always dismiss the drawer. */
    nav.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a') : null;
      if (!link || !nav.contains(link)) return;
      var href = link.getAttribute('href');
      if (href && href !== '#') setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    /* Sub-menu accordions. On the desktop layout the sub-menus open on hover,
       so the buttons are hidden by CSS and this only matters in the drawer. */
    var parents = nav.querySelectorAll('li');
    Array.prototype.forEach.call(parents, function (li) {
      var submenu = li.querySelector(':scope > ul');
      var link = li.querySelector(':scope > a');
      if (!submenu || !link) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'submenu-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Show sub-menu for ' + link.textContent.trim());
      li.insertBefore(btn, submenu);

      function setSub(open) {
        li.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setSub(!li.classList.contains('is-open'));
      });

      /* A parent whose own href is just "#" should open its children rather
         than navigating nowhere. */
      link.addEventListener('click', function (e) {
        if (window.innerWidth > DRAWER_BREAKPOINT) return;
        var href = link.getAttribute('href');
        if (!href || href === '#') {
          e.preventDefault();
          setSub(!li.classList.contains('is-open'));
        }
      });

      /* Start expanded when it contains the current page. */
      if (li.classList.contains('active')) setSub(true);
    });

    /* Returning to the desktop layout must not leave the page locked. */
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (window.innerWidth > DRAWER_BREAKPOINT && isOpen()) setOpen(false);
      }, 150);
    });
  }

  /* -------------------------------------------------------- back to top */
  function initBackToTop() {
    var btn = document.getElementById('backtotop');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    var ticking = false;
    function update() {
      btn.classList.toggle('visible', window.pageYOffset > 250);
      ticking = false;
    }
    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ------------------------------------------------------------- tables */
  function initTables() {
    var tables = document.querySelectorAll('table');
    Array.prototype.forEach.call(tables, function (table) {
      var parent = table.parentNode;
      if (!parent) return;
      if (parent.classList && (parent.classList.contains('table-scroll') || parent.classList.contains('scrollable'))) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Scrollable table');
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  /* --------------------------------------------------------- skip link */
  function initSkipLink() {
    var target =
      document.querySelector('main') ||
      document.querySelector('.content') ||
      document.querySelector('.container');
    if (!target) return;
    if (!target.id) target.id = 'main-content';

    var link = document.createElement('a');
    link.className = 'skip-link';
    link.href = '#' + target.id;
    link.textContent = 'Skip to content';
    document.body.insertBefore(link, document.body.firstChild);

    link.addEventListener('click', function () {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  ready(function () {
    initSkipLink();
    initNav();
    initBackToTop();
    initTables();
  });
})();

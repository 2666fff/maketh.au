(() => {
  const header = document.getElementById('siteHeader');
  const links = document.getElementById('navLinks');
  const toggle = document.getElementById('navToggle');
  const gamesToggle = document.getElementById('gamesToggle');
  const games = gamesToggle?.closest('.nav-games');
  const backToTop = document.getElementById('backToTop');
  const openLabel = toggle.dataset.openLabel || 'Open navigation';
  const closeLabel = toggle.dataset.closeLabel || 'Close navigation';
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];

  function closeGamesMenu() {
    if (!games || !gamesToggle) return;
    games.classList.remove('is-open');
    gamesToggle.setAttribute('aria-expanded', 'false');
  }

  function closeMenu() {
    closeGamesMenu();
    links.classList.remove('open');
    header.classList.remove('open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', openLabel);
  }

  toggle.addEventListener('click', () => {
    const open = !links.classList.contains('open');
    if (open) {
      links.classList.add('open');
      header.classList.add('open');
      document.body.classList.add('menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', closeLabel);
    } else {
      closeMenu();
    }
  });

  gamesToggle?.addEventListener('click', () => {
    const open = !games.classList.contains('is-open');
    games.classList.toggle('is-open', open);
    gamesToggle.setAttribute('aria-expanded', String(open));
  });

  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (games && !games.contains(event.target)) closeGamesMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeMenu();
  });

  if (revealTargets.length > 0) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    revealTargets.forEach((target) => {
      const delay = Math.min(Math.max(Number(target.dataset.revealDelay) || 0, 0), 400);
      target.style.setProperty('--reveal-delay', `${delay}ms`);
    });

    if (!reduceMotion && 'IntersectionObserver' in window) {
      document.documentElement.classList.add('reveal-enabled');
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.04, rootMargin: '0px 0px -8% 0px' });

      revealTargets.forEach((target) => observer.observe(target));
    } else {
      revealTargets.forEach((target) => target.classList.add('is-visible'));
    }
  }

  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('show', window.scrollY > 560);
    }, { passive: true });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();

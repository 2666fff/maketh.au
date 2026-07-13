const track = document.querySelector('[data-gallery-track]');
const shots = Array.from(document.querySelectorAll('[data-shot]'));
const previousGroupButton = document.querySelector('[data-gallery-prev]');
const nextGroupButton = document.querySelector('[data-gallery-next]');
const lightbox = document.querySelector('[data-lightbox]');
const lightboxImage = document.querySelector('[data-lightbox-image]');
const lightboxCaption = document.querySelector('[data-lightbox-caption]');
const lightboxCloseButton = document.querySelector('[data-lightbox-close]');
const lightboxPreviousButton = document.querySelector('[data-lightbox-prev]');
const lightboxNextButton = document.querySelector('[data-lightbox-next]');

let activeShotIndex = 0;
let lightboxOpener = null;

function getGalleryStep() {
  const firstShot = shots[0];
  if (!track || !firstShot) return 0;
  const styles = getComputedStyle(track);
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
  const visibleShots = Math.max(1, Math.floor(track.clientWidth / (firstShot.offsetWidth + gap)));
  return (firstShot.offsetWidth + gap) * visibleShots;
}

function scrollGallery(direction) {
  if (!track) return;
  track.scrollBy({ left: getGalleryStep() * direction, behavior: 'smooth' });
}

function updateGalleryControls() {
  if (!track || !previousGroupButton || !nextGroupButton) return;
  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  previousGroupButton.disabled = track.scrollLeft <= 2;
  nextGroupButton.disabled = track.scrollLeft >= maxScrollLeft - 2;
}

function renderLightbox(index) {
  const shot = shots[index];
  if (!shot || !lightboxImage || !lightboxCaption) return;
  activeShotIndex = index;
  lightboxImage.src = shot.dataset.src || '';
  lightboxImage.alt = shot.querySelector('img')?.alt || '';
  lightboxCaption.textContent = shot.dataset.caption || '';
}

function openLightbox(index, opener) {
  if (!lightbox || typeof lightbox.showModal !== 'function') return;
  lightboxOpener = opener;
  renderLightbox(index);
  lightbox.showModal();
}

function moveLightbox(direction) {
  if (!shots.length) return;
  renderLightbox((activeShotIndex + direction + shots.length) % shots.length);
}

previousGroupButton?.addEventListener('click', () => scrollGallery(-1));
nextGroupButton?.addEventListener('click', () => scrollGallery(1));
track?.addEventListener('scroll', updateGalleryControls, { passive: true });
window.addEventListener('resize', updateGalleryControls);

shots.forEach((shot, index) => {
  shot.addEventListener('click', () => openLightbox(index, shot));
});

lightboxCloseButton?.addEventListener('click', () => lightbox?.close());
lightboxPreviousButton?.addEventListener('click', () => moveLightbox(-1));
lightboxNextButton?.addEventListener('click', () => moveLightbox(1));

lightbox?.addEventListener('click', (event) => {
  if (event.target === lightbox) lightbox.close();
});

lightbox?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveLightbox(-1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveLightbox(1);
  }
});

lightbox?.addEventListener('close', () => {
  lightboxImage?.removeAttribute('src');
  lightboxOpener?.focus();
  lightboxOpener = null;
});

updateGalleryControls();

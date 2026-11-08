import previews from '../data/link-previews.json';

const normalize = (url) => {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.href;
};

const popup = document.createElement('div');
popup.id = 'link-preview';
popup.className = 'link-preview';
popup.setAttribute('role', 'tooltip');
popup.hidden = true;
const details = document.createElement('div');
details.className = 'link-preview-details';
const title = document.createElement('p');
title.className = 'link-preview-title';
const description = document.createElement('p');
description.className = 'link-preview-description';
const domain = document.createElement('p');
domain.className = 'link-preview-domain';
details.append(title, description, domain);
popup.append(details);
document.body.append(popup);

let activeLink = null;
let timer;
let hideTimer;
const ownHosts = new Set(["anandmohanan.com", "www.anandmohanan.com", "niemand.blog", "www.niemand.blog"]);
const hover = window.matchMedia('(hover: hover) and (pointer: fine)');

function destination(link) {
  if (!link || link.hasAttribute('download') || link.hasAttribute('data-no-preview')) return null;
  const raw = link.getAttribute('href');
  if (!raw || raw.startsWith('#')) return null;
  let url;
  try { url = new URL(raw, location.href); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (/\.(xml|png|jpe?g|svg|webp|avif|zip|mp4|mp3)$/i.test(url.pathname)) return null;
  if (url.origin === location.origin || ownHosts.has(url.hostname)) return null;
  return url;
}

function position() {
  if (!activeLink || popup.hidden) return;
  const anchor = activeLink.getBoundingClientRect();
  const box = popup.getBoundingClientRect();
  const left = Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12));
  const below = anchor.bottom + 12;
  const top = below + box.height <= innerHeight - 12 ? below : Math.max(12, anchor.top - box.height - 12);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function close() {
  clearTimeout(timer);
  clearTimeout(hideTimer);
  if (activeLink) {
    const ids = (activeLink.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== popup.id);
    if (ids.length) activeLink.setAttribute('aria-describedby', ids.join(' '));
    else activeLink.removeAttribute('aria-describedby');
  }
  activeLink = null;
  popup.hidden = true;
}

function open(link, delay) {
  clearTimeout(hideTimer);
  const url = destination(link);
  if (!url) return;
  if (activeLink === link && !popup.hidden) return;
  close();
  activeLink = link;
  timer = setTimeout(() => {
    if (activeLink !== link || !link.isConnected) return;
    const entry = previews[normalize(url.href)] || {};
    title.textContent = entry.title || link.querySelector('h2, h3')?.textContent || link.textContent.trim() || link.getAttribute('aria-label') || url.hostname;
    description.textContent = entry.description || '';
    description.hidden = !description.textContent;
    domain.textContent = url.hostname.replace(/^www\./, '') + (url.hostname === 'github.com' ? url.pathname : '');
    const ids = new Set((link.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(popup.id);
    link.setAttribute('aria-describedby', [...ids].join(' '));
    popup.hidden = false;
    position();
  }, delay);
}

const anchorFor = (target) => target instanceof Element ? target.closest('a[href]') : null;
document.addEventListener('pointerover', event => {
  if (event.pointerType === 'touch' || !hover.matches) return;
  const link = anchorFor(event.target);
  if (link && !link.contains(event.relatedTarget)) open(link, 180);
});
document.addEventListener('pointerout', event => {
  const link = anchorFor(event.target);
  if (link && link === activeLink && !link.contains(event.relatedTarget)) {
    if (popup.contains(event.relatedTarget)) return;
    if (document.activeElement !== link || !link.matches(':focus-visible')) hideTimer = setTimeout(close, 150);
  }
});
popup.addEventListener('pointerenter', () => clearTimeout(hideTimer));
popup.addEventListener('pointerleave', () => {
  if (!activeLink || document.activeElement !== activeLink || !activeLink.matches(':focus-visible')) close();
});
document.addEventListener('focusin', event => {
  const link = anchorFor(event.target);
  if (link?.matches(':focus-visible')) open(link, 0);
});
document.addEventListener('focusout', event => { if (anchorFor(event.target) === activeLink) close(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
document.addEventListener('scroll', () => {
  if (activeLink && document.activeElement === activeLink && activeLink.matches(':focus-visible')) position();
  else close();
}, { capture: true, passive: true });
window.addEventListener('resize', close);
window.addEventListener('blur', close);

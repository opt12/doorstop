/**
 * doorstop-hover-preview.js
 *
 * Displays a preview popup when hovering over requirement links in a Doorstop
 * HTML export. Supports same-page links and links to other files in the same
 * export (loaded via fetch).
 *
 * Usage: <script src="../template/doorstop-hover-preview.js" defer></script>
 */

(function () {
    'use strict';

    // ─── Configuration ────────────────────────────────────────────────────────
    const CONFIG = {
        // Delay in ms before the preview appears / disappears
        showDelay: 200,
        hideDelay: 150,

        // Maximum width/height of the preview popup
        maxWidth: '500px',
        maxHeight: '400px',

        // Offset from cursor / viewport edge in px
        cursorOffset: 12,
        viewportMargin: 16,

        // CSS class prefix (for easy customization)
        cssPrefix: 'ds-preview',
    };

    // ─── Base URL ─────────────────────────────────────────────────────────────
    // Captured once at page load — never changes, even when previews are nested
    const PAGE_BASE = window.location.href.replace(/\/[^/]*$/, '/');

    // ─── CSS ──────────────────────────────────────────────────────────────────
    const CSS = `
    .ds-preview-popup {
      position: fixed;
      z-index: 9999;
      background: #ffffff;
      border: 1px solid #cccccc;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 12px 16px;
      max-width: ${CONFIG.maxWidth};
      max-height: ${CONFIG.maxHeight};
      overflow-y: auto;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #333333;
    }

    .ds-preview-popup.ds-preview-visible {
      display: block;
    }

    .ds-preview-popup.ds-preview-hidden {
      display: none;
    }

    .ds-preview-header {
      font-weight: bold;
      font-size: 0.95rem;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #eeeeee;
      color: #111111;
    }

    .ds-preview-body {
      /* Requirement content */
    }

    .ds-preview-body img {
      max-width: 100%;
    }

    .ds-preview-body pre {
      overflow-x: auto;
      background: #f5f5f5;
      padding: 6px 8px;
      border-radius: 3px;
      font-size: 0.8rem;
    }

    .ds-preview-loading {
      color: #888888;
      font-style: italic;
    }

    .ds-preview-error {
      color: #cc0000;
      font-style: italic;
    }
  `;

    // ─── State ────────────────────────────────────────────────────────────────
    // Cache for fetched HTML documents: url → { doc, base }
    const docCache = new Map();

    let popup = null;
    let showTimer = null;
    let hideTimer = null;

    // ─── Initialisation ───────────────────────────────────────────────────────
    function init() {
        injectStyles();
        createPopup();
        attachListeners();
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function createPopup() {
        popup = document.createElement('div');
        popup.className = `${CONFIG.cssPrefix}-popup ${CONFIG.cssPrefix}-hidden`;

        // Keep popup visible when mouse moves into it
        popup.addEventListener('mouseover', () => {
            clearTimeout(hideTimer);
        });

        // Hide popup when mouse leaves it
        popup.addEventListener('mouseout', (e) => {
            if (popup.contains(e.relatedTarget)) return;
            hideTimer = setTimeout(() => {
                hidePopup();
            }, CONFIG.hideDelay);
        });

        document.body.appendChild(popup);
    }

    // ─── Link detection ───────────────────────────────────────────────────────
    /**
     * Parses an anchor element and returns requirement link info, or null.
     *
     * Recognised formats:
     *   href="REQ.html#REQ003"        → { file: 'REQ.html', id: 'REQ003' }
     *   href="../foo/REQ.html#REQ003" → { file: '../foo/REQ.html', id: 'REQ003' }
     *   href="#TUT001"                → { file: null, id: 'TUT001' }
     *
     * Requirement ID pattern: 2+ letters, optional dash/underscore, digits
     * e.g. REQ003, TUT001, SRS-213, HLT_004
     */
    function parseRequirementLink(anchor) {
        const href = anchor.getAttribute('href');
        if (!href) return null;

        // Ignore mailto, javascript etc.
        if (/^(mailto:|javascript:)/i.test(href)) return null;

        // Handle absolute URLs — only accept same-origin
        if (/^https?:/i.test(href)) {
            if (!href.startsWith(window.location.origin)) return null;
            // Extract the fragment
            const url = new URL(href);
            const id = url.hash.slice(1);
            if (!id || !/^[A-Za-z]{2,}[-_]?[0-9]+$/.test(id)) return null;
            // File path relative to PAGE_BASE
            const filePath = url.href.replace(url.hash, '');
            return { file: filePath, id };
        }

        // Relative URLs
        const hashIndex = href.indexOf('#');
        if (hashIndex === -1) return null;

        const id = href.slice(hashIndex + 1);
        if (!id) return null;
        if (!/^[A-Za-z]{2,}[-_]?[0-9]+$/.test(id)) return null;

        const filePart = href.slice(0, hashIndex) || null;
        return { file: filePart, id };
    }

    // ─── Event listeners ──────────────────────────────────────────────────────
    function attachListeners() {
        document.addEventListener('mouseover', onMouseOver);
        document.addEventListener('mouseout', onMouseOut);
        document.addEventListener('mousemove', onMouseMove);
    }

    function onMouseOver(e) {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        const link = parseRequirementLink(anchor);
        if (!link) return;

        clearTimeout(hideTimer);
        clearTimeout(showTimer);

        showTimer = setTimeout(() => {
            showPreview(link, e.clientX, e.clientY);
        }, CONFIG.showDelay);
    }

    function onMouseOut(e) {
        clearTimeout(showTimer);
        // Do not hide if the mouse moves into the popup
        if (popup.contains(e.relatedTarget)) return;
        hideTimer = setTimeout(() => {
            hidePopup();
        }, CONFIG.hideDelay);
    }

    function onMouseMove(e) {
        // Do not reposition while the mouse is inside the popup (user may be scrolling)
        if (popup.matches(':hover')) return;
        if (!popup.classList.contains(`${CONFIG.cssPrefix}-hidden`)) {
            positionPopup(e.clientX, e.clientY);
        }
    }

    // ─── Show preview ─────────────────────────────────────────────────────────
    async function showPreview(link, x, y) {
        setPopupContent(
            `<div class="${CONFIG.cssPrefix}-loading">Loading…</div>`,
            null,
            PAGE_BASE
        );
        showPopup(x, y);

        try {
            const { heading, body, base } = await extractRequirement(link);
            setPopupContent(body, heading, base);
            positionPopup(x, y);
        } catch (err) {
            setPopupContent(
                `<div class="${CONFIG.cssPrefix}-error">Error: ${escapeHtml(err.message)}</div>`,
                null,
                PAGE_BASE
            );
        }
    }

    function setPopupContent(bodyHtml, headingText, base) {
        const headerHtml = headingText
            ? `<div class="${CONFIG.cssPrefix}-header">${escapeHtml(headingText)}</div>`
            : '';
        popup.innerHTML = `${headerHtml}<div class="${CONFIG.cssPrefix}-body">${bodyHtml}</div>`;

        // Rewrite all relative links in the popup to absolute URLs
        // so that nested hover previews resolve correctly
        popup.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || /^(https?:|mailto:|javascript:|#)/i.test(href)) return;
            try {
                a.setAttribute('href', new URL(href, base).href);
            } catch (e) { /* ignore invalid URLs */ }
        });
    }

    // ─── Requirement extraction ───────────────────────────────────────────────
    async function extractRequirement(link) {
        let doc;
        let base = PAGE_BASE;

        if (link.file) {
            // link.file kann jetzt bereits eine absolute URL sein
            const url = /^https?:/i.test(link.file)
                ? link.file
                : resolveUrl(link.file, base);
            const fetched = await fetchDocument(url);
            doc = fetched.doc;
            base = fetched.base;
        } else {
            doc = document;
            base = PAGE_BASE;
        }

        const { heading, body } = extractFromDocument(doc, link.id);
        return { heading, body, base };
    }

    /**
     * Resolves a relative file path against an explicit base URL.
     */
    function resolveUrl(filePath, base) {
        return new URL(filePath, base).href;
    }

    async function fetchDocument(url) {
        if (docCache.has(url)) {
            return docCache.get(url);
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} loading ${url}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Store the base URL of the fetched document for resolving its relative links
        const base = url.replace(/\/[^/]*$/, '/');
        const entry = { doc, base };
        docCache.set(url, entry);
        return entry;
    }

    /**
     * Extracts the heading text and body HTML of a requirement from a Document.
     *
     * A requirement starts at a heading element (h1–h6) with the given id,
     * and ends before the next heading element that has an id attribute.
     */
    function extractFromDocument(doc, id) {
        const headingEl = doc.getElementById(id);
        if (!headingEl) {
            throw new Error(`Requirement "${id}" not found.`);
        }

        const headingText = headingEl.textContent.trim();

        // Collect all siblings until the next heading with an id
        const bodyNodes = [];
        let sibling = headingEl.nextElementSibling;

        while (sibling) {
            if (isHeadingWithId(sibling)) break;
            bodyNodes.push(sibling.outerHTML);
            sibling = sibling.nextElementSibling;
        }

        return {
            heading: headingText,
            body: bodyNodes.join('\n') || '<em>(no content)</em>',
        };
    }

    function isHeadingWithId(el) {
        return /^H[1-6]$/i.test(el.tagName) && el.hasAttribute('id');
    }

    // ─── Popup positioning ────────────────────────────────────────────────────
    function showPopup(x, y) {
        popup.classList.remove(`${CONFIG.cssPrefix}-hidden`);
        popup.classList.add(`${CONFIG.cssPrefix}-visible`);
        positionPopup(x, y);
    }

    function hidePopup() {
        popup.classList.remove(`${CONFIG.cssPrefix}-visible`);
        popup.classList.add(`${CONFIG.cssPrefix}-hidden`);
    }

    function positionPopup(x, y) {
        const margin = CONFIG.viewportMargin;
        const offset = CONFIG.cursorOffset;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = popup.offsetWidth;
        const ph = popup.offsetHeight;

        let left = x + offset;
        let top = y + offset;

        // Keep within right edge
        if (left + pw + margin > vw) {
            left = x - pw - offset;
        }
        // Keep within bottom edge
        if (top + ph + margin > vh) {
            top = y - ph - offset;
        }
        // Keep within left edge
        if (left < margin) left = margin;
        // Keep within top edge
        if (top < margin) top = margin;

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }

    // ─── Utilities ────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Bootstrap ────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
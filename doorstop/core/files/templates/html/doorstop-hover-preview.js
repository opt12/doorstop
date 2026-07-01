/**
 * doorstop-hover-preview.js
 * 
 * Zeigt beim Hovern über Requirement-Links eine Vorschau des verlinkten
 * Requirements an. Unterstützt same-page Links und Links zu anderen Dateien
 * im gleichen Export.
 * 
 * Einbinden: <script src="doorstop-hover-preview.js"></script>
 */

(function () {
    'use strict';

    // ─── Konfiguration ────────────────────────────────────────────────────────
    const CONFIG = {
        // Verzögerung in ms bevor die Vorschau erscheint / verschwindet
        showDelay: 200,
        hideDelay: 150,

        // Maximale Breite/Höhe der Vorschau
        maxWidth: '500px',
        maxHeight: '400px',

        // Abstand zum Cursor / Fensterrand in px
        cursorOffset: 12,
        viewportMargin: 16,

        // CSS-Klassen-Prefix (für einfache Anpassung)
        cssPrefix: 'ds-preview',
    };

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
      pointer-events: none;
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
      /* Inhalt des Requirements */
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
    // Cache für geladene HTML-Dokumente: url → Document
    const docCache = new Map();

    let popup = null;
    let showTimer = null;
    let hideTimer = null;

    // ─── Init ─────────────────────────────────────────────────────────────────
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
        document.body.appendChild(popup);
    }

    // ─── Link-Erkennung ───────────────────────────────────────────────────────
    /**
     * Gibt zurück ob ein Anchor-Element ein Requirement-Link ist.
     * Erkennt:
     *   href="REQ.html#REQ003"     → { file: 'REQ.html', id: 'REQ003' }
     *   href="../foo/REQ.html#REQ003" → { file: '../foo/REQ.html', id: 'REQ003' }
     *   href="#TUT001"             → { file: null, id: 'TUT001' }
     */
    function parseRequirementLink(anchor) {
        const href = anchor.getAttribute('href');
        if (!href) return null;

        // Ignoriere externe Links, Mailto etc.
        if (/^(https?:|mailto:|javascript:)/i.test(href)) return null;

        const hashIndex = href.indexOf('#');
        if (hashIndex === -1) return null;

        const id = href.slice(hashIndex + 1);
        if (!id) return null;

        // Requirement-IDs haben typischerweise das Format PREFIX + Ziffern
        // z.B. REQ003, TUT001, HLT002 — mindestens 2 Buchstaben + Ziffern
        if (!/^[A-Za-z]{2,}[0-9]+$/.test(id)) return null;

        const filePart = href.slice(0, hashIndex) || null;

        return { file: filePart, id };
    }

    // ─── Event-Listener ───────────────────────────────────────────────────────
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
        hideTimer = setTimeout(() => {
            hidePopup();
        }, CONFIG.hideDelay);
    }

    function onMouseMove(e) {
        if (popup && !popup.classList.contains(`${CONFIG.cssPrefix}-hidden`)) {
            positionPopup(e.clientX, e.clientY);
        }
    }

    // ─── Vorschau anzeigen ────────────────────────────────────────────────────
    async function showPreview(link, x, y) {
        setPopupContent(
            `<div class="${CONFIG.cssPrefix}-loading">Lade…</div>`,
            null
        );
        showPopup(x, y);

        try {
            const { heading, body } = await extractRequirement(link);
            setPopupContent(body, heading);
            positionPopup(x, y);
        } catch (err) {
            setPopupContent(
                `<div class="${CONFIG.cssPrefix}-error">Fehler: ${escapeHtml(err.message)}</div>`,
                null
            );
        }
    }

    function setPopupContent(bodyHtml, headingText) {
        const headerHtml = headingText
            ? `<div class="${CONFIG.cssPrefix}-header">${escapeHtml(headingText)}</div>`
            : '';
        popup.innerHTML = `${headerHtml}<div class="${CONFIG.cssPrefix}-body">${bodyHtml}</div>`;
    }

    // ─── Requirement extrahieren ──────────────────────────────────────────────
    async function extractRequirement(link) {
        let doc;

        if (link.file) {
            doc = await fetchDocument(resolveUrl(link.file));
        } else {
            doc = document;
        }

        return extractFromDocument(doc, link.id);
    }

    /**
     * Löst eine relative Datei-URL relativ zur aktuellen Seite auf.
     */
    function resolveUrl(filePath) {
        // Basis = Verzeichnis der aktuellen Seite
        const base = window.location.href.replace(/\/[^/]*$/, '/');
        return new URL(filePath, base).href;
    }

    async function fetchDocument(url) {
        if (docCache.has(url)) {
            return docCache.get(url);
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} beim Laden von ${url}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        docCache.set(url, doc);
        return doc;
    }

    /**
     * Extrahiert Heading-Text + Body-HTML eines Requirements aus einem Document.
     * 
     * Ein Requirement beginnt an einem Heading-Element (h1–h6) mit dem gesuchten id,
     * und endet vor dem nächsten Heading-Element mit einem id-Attribut.
     */
    function extractFromDocument(doc, id) {
        const headingEl = doc.getElementById(id);
        if (!headingEl) {
            throw new Error(`Requirement "${id}" nicht gefunden.`);
        }

        const headingText = headingEl.textContent.trim();

        // Sammle alle Siblings bis zum nächsten Heading mit ID
        const bodyNodes = [];
        let sibling = headingEl.nextElementSibling;

        while (sibling) {
            if (isHeadingWithId(sibling)) break;
            bodyNodes.push(sibling.outerHTML);
            sibling = sibling.nextElementSibling;
        }

        return {
            heading: headingText,
            body: bodyNodes.join('\n') || '<em>(kein Inhalt)</em>',
        };
    }

    function isHeadingWithId(el) {
        return /^H[1-6]$/i.test(el.tagName) && el.hasAttribute('id');
    }

    // ─── Popup-Positionierung ─────────────────────────────────────────────────
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

        // Rechten Rand einhalten
        if (left + pw + margin > vw) {
            left = x - pw - offset;
        }
        // Unteren Rand einhalten
        if (top + ph + margin > vh) {
            top = y - ph - offset;
        }
        // Linken Rand einhalten
        if (left < margin) left = margin;
        // Oberen Rand einhalten
        if (top < margin) top = margin;

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }

    // ─── Hilfsfunktionen ──────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Start ────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
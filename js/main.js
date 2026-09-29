/**
 * FlipBook LABOTEC - Dynamic Google Drive Sync & 3D FlipBook Viewer
 * Optimized with IndexedDB Pre-fetching & Instant Local Caching
 */

// ⚠️ COLOCA AQUÍ LA URL DE TU GOOGLE APPS SCRIPT (WEB APP):
const GOOGLE_DRIVE_ENDPOINT = 'https://script.google.com/macros/library/d/1cTaJ8ZiI2fUr16Gk8WMO4qbyPGepFCZGCLBes8ItDFjp_ca6--Ina2Oc/4';

// IndexedDB Storage Settings
const DB_NAME = 'FlipBookCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_files';

document.addEventListener('DOMContentLoaded', () => {
    const views = {
        library: document.getElementById('library-view'),
        reader: document.getElementById('reader-view')
    };

    const btns = {
        backLibrary: document.getElementById('btn-back-library'),
        prevPage: document.getElementById('btn-prev'),
        nextPage: document.getElementById('btn-next'),
        fullscreen: document.getElementById('btn-fullscreen'),
        syncHeader: document.getElementById('btn-sync-header')
    };

    const searchInput = document.getElementById('search-input');
    const documentsGrid = document.getElementById('documents-grid');
    const librarySubtitle = document.getElementById('library-count-subtitle');
    const readerTitle = document.getElementById('reader-title');
    const readerLoading = document.getElementById('reader-loading');
    const readerLoadingText = document.getElementById('reader-loading-text');

    let allPublications = [];
    let pageFlip = null;

    init();

    function init() {
        setupEventListeners();
        loadLibrary();
    }

    function setupEventListeners() {
        btns.backLibrary.onclick = () => switchView('library');

        btns.syncHeader.onclick = () => {
            btns.syncHeader.disabled = true;
            btns.syncHeader.style.opacity = '0.7';
            loadLibrary().finally(() => {
                btns.syncHeader.disabled = false;
                btns.syncHeader.style.opacity = '1';
            });
        };

        if (searchInput) {
            searchInput.oninput = (e) => filterPublications(e.target.value);
        }

        btns.fullscreen.onclick = () => {
            const wrapper = document.querySelector('.flipbook-wrapper');
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
            } else {
                document.exitFullscreen();
            }
        };
    }

    /* ==========================================================================
       IndexedDB Cache System (Instant Loading & Auto Cleanup)
       ========================================================================== */

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getCachedPDF(id) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async function setCachedPDF(id, dataObject) {
        try {
            const db = await openCacheDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(dataObject, id);
        } catch (e) {
            console.warn('Error guardando en IndexedDB:', e);
        }
    }

    // Limpieza automática: borra de IndexedDB cualquier archivo que haya sido eliminado de Drive
    async function cleanUnusedCache(currentDriveItems) {
        try {
            const validIds = new Set(currentDriveItems.map(item => item.id).filter(Boolean));
            const db = await openCacheDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAllKeys();

            req.onsuccess = () => {
                const keys = req.result || [];
                keys.forEach(key => {
                    if (!validIds.has(key)) {
                        store.delete(key);
                        console.log(`🧹 Caché eliminada para PDF retirado de Google Drive: ${key}`);
                    }
                });
            };
        } catch (e) {
            console.warn('Error en limpieza automática de caché:', e);
        }
    }

    // Pre-carga silenciosa en segundo plano
    async function prefetchItems(items) {
        for (let item of items) {
            if (!item.id) continue;
            const existing = await getCachedPDF(item.id);
            if (!existing || (item.lastUpdated && existing.lastUpdated !== item.lastUpdated)) {
                try {
                    const fetchUrl = `/api/pdf?id=${item.id}`;
                    const res = await fetch(fetchUrl);
                    if (res.ok) {
                        const arrayBuffer = await res.arrayBuffer();
                        const uint8 = new Uint8Array(arrayBuffer);
                        await setCachedPDF(item.id, {
                            data: uint8,
                            lastUpdated: item.lastUpdated || '',
                            size: item.size || 0
                        });
                        console.log(`⚡ Pre-carga completada para: ${item.title}`);
                    }
                } catch (e) {
                    console.log('Pre-carga silenciosa omitida:', e);
                }
            }
        }
    }

    /* ==========================================================================
       Library Functions
       ========================================================================== */

    function switchView(viewName) {
        if (viewName !== 'reader' && pageFlip) {
            try { pageFlip.destroy(); } catch (e) { }
            pageFlip = null;
        }
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    function base64ToUint8Array(base64) {
        const raw = atob(base64);
        const uint8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            uint8Array[i] = raw.charCodeAt(i);
        }
        return uint8Array;
    }

    async function loadLibrary() {
        documentsGrid.innerHTML = `
            <div class="loading-docs">
                <div class="spinner"></div>
                <p>Cargando publicaciones desde Google Drive...</p>
            </div>
        `;

        librarySubtitle.innerText = 'Sincronizando catálogo con Google Drive...';
        allPublications = [];

        if (GOOGLE_DRIVE_ENDPOINT.includes('drive.google.com/drive/folders')) {
            renderConfigWarning('Configuración de Google Script requerida', 'En la línea 7 de <code>js/main.js</code> colocaste el enlace directo de la carpeta en lugar de la URL de tu Google Apps Script (Web App).');
            return;
        }

        if (GOOGLE_DRIVE_ENDPOINT && GOOGLE_DRIVE_ENDPOINT.includes('script.google.com')) {
            try {
                const res = await fetch(GOOGLE_DRIVE_ENDPOINT);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        allPublications = data;
                    } else if (data.error) {
                        console.error('Drive Script Error:', data.error);
                    }
                }
            } catch (e) {
                console.warn('Error fetching from Google Drive Script:', e);
            }
        }

        if ((!allPublications || allPublications.length === 0) && !GOOGLE_DRIVE_ENDPOINT) {
            try {
                const res = await fetch('catalogs.json');
                if (res.ok) {
                    allPublications = await res.json();
                }
            } catch (e) {
                console.log('No local catalogs.json available');
            }
        }

        // Ejecutar limpieza de archivos eliminados en Drive
        if (allPublications && allPublications.length > 0) {
            cleanUnusedCache(allPublications);
            // Iniciar pre-carga en segundo plano después de 1 segundo
            setTimeout(() => prefetchItems(allPublications), 1000);
        }

        filterPublications(searchInput ? searchInput.value : '');
    }

    function renderConfigWarning(title, message) {
        librarySubtitle.innerText = 'Configuración requerida';
        documentsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 2.5rem 1.5rem; max-width: 680px; margin: 1rem auto; backdrop-filter: blur(12px);">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
                <h3 style="color: #f87171; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem;">${title}</h3>
                <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.6;">${message}</p>
                <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 1rem;">Coloca la URL de tu Web App en la constante <code>GOOGLE_DRIVE_ENDPOINT</code> en el archivo <code>js/main.js</code>.</p>
            </div>
        `;
    }

    function filterPublications(query) {
        const term = query.toLowerCase().trim();
        const filtered = allPublications.filter(item => {
            const title = (item.title || item.name || '').toLowerCase();
            return title.includes(term);
        });

        if (librarySubtitle) {
            if (!GOOGLE_DRIVE_ENDPOINT && allPublications.length === 0) {
                librarySubtitle.innerText = 'Coloca la URL de tu Google Apps Script en js/main.js';
            } else {
                librarySubtitle.innerText = `${filtered.length} publicación(es) disponible(s) en tiempo real`;
            }
        }

        renderLibraryGrid(filtered);
    }

    async function renderLibraryGrid(items) {
        documentsGrid.innerHTML = '';

        if (!items || items.length === 0) {
            if (!GOOGLE_DRIVE_ENDPOINT && allPublications.length === 0) {
                renderConfigWarning('Falta configurar la URL de Google Drive', 'Coloca la URL de tu Google Apps Script en la variable <code>GOOGLE_DRIVE_ENDPOINT</code> en el archivo <code>js/main.js</code>.');
                return;
            }

            documentsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 4rem 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">📭</div>
                    <p style="font-size: 1.1rem; font-weight: 500;">No se encontraron publicaciones en la carpeta de Google Drive.</p>
                    <p style="font-size: 0.85rem; margin-top: 0.5rem;">Sube un archivo PDF a tu carpeta de Google Drive y presiona <strong>Sincronizar</strong>.</p>
                </div>
            `;
            return;
        }

        for (let item of items) {
            const card = document.createElement('div');
            card.className = 'doc-card';

            const coverWrapper = document.createElement('div');
            coverWrapper.className = 'doc-cover-wrapper';

            coverWrapper.innerHTML = `
                <div class="doc-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                    </svg>
                    <span style="font-size: 0.75rem; font-weight: 500; opacity: 0.7;">Documento PDF</span>
                </div>
            `;

            const title = document.createElement('h3');
            title.innerText = item.title || item.name || 'Publicación';

            const meta = document.createElement('div');
            meta.className = 'doc-meta';

            const dateStr = item.date ? new Date(item.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : 'PDF Digital';
            meta.innerHTML = `
                <span>${dateStr}</span>
                <span class="doc-tag">FlipBook 3D</span>
            `;

            card.appendChild(coverWrapper);
            card.appendChild(title);
            card.appendChild(meta);

            // Pre-cargar al hacer hover sobre la tarjeta para respuesta ultrarrápida
            card.onmouseenter = () => prefetchItems([item]);

            card.onclick = () => openReaderForDocument(item);
            documentsGrid.appendChild(card);
        }
    }

    // Async Page Canvas Rendering direct to IMG element
    async function renderPageContent(pdf, pageNum, scale = 1.25) {
        const imgEl = document.getElementById(`page-img-${pageNum}`);
        if (!imgEl) return;

        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: ctx, viewport }).promise;
            imgEl.src = canvas.toDataURL('image/jpeg', 0.78);
        } catch (e) {
            console.error(`Error renderizando página ${pageNum}:`, e);
        }
    }

    // Instant Reader Functionality with IndexedDB Cache & Pre-fetch
    async function openReaderForDocument(item) {
        readerTitle.innerText = item.title || 'Publicación PDF';
        switchView('reader');

        readerLoading.classList.remove('hidden');
        readerLoadingText.innerText = 'Comprobando caché local...';

        const wrapper = document.querySelector('.flipbook-wrapper');
        wrapper.innerHTML = '<div id="flipbook" class="flipbook"></div>';
        const flipbookEl = document.getElementById('flipbook');

        try {
            let loadingTask = null;

            // PASO A: Verificar si el PDF ya está guardado en la memoria local (IndexedDB)
            if (item.id) {
                const cached = await getCachedPDF(item.id);
                if (cached && cached.data) {
                    readerLoadingText.innerText = '⚡ Abriendo al instante desde memoria local...';
                    loadingTask = pdfjsLib.getDocument({
                        data: cached.data,
                        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                        cMapPacked: true
                    });
                }
            }

            // PASO B: Si no está en caché, descargar desde el servidor Proxy Vercel (/api/pdf?id=...)
            if (!loadingTask && item.id) {
                const proxyUrl = `/api/pdf?id=${item.id}`;
                try {
                    readerLoadingText.innerText = 'Descargando archivo desde Google Drive...';
                    const res = await fetch(proxyUrl);
                    if (res.ok) {
                        const arrayBuffer = await res.arrayBuffer();
                        const uint8 = new Uint8Array(arrayBuffer);
                        
                        // Guardar en caché para la próxima vez
                        setCachedPDF(item.id, {
                            data: uint8,
                            lastUpdated: item.lastUpdated || '',
                            size: item.size || 0
                        });

                        loadingTask = pdfjsLib.getDocument({
                            data: uint8,
                            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                            cMapPacked: true
                        });
                    }
                } catch (proxyError) {
                    console.warn('Proxy Vercel falló, intentando Google Script...', proxyError);
                    loadingTask = null;
                }
            }

            // PASO C: Fallback a Google Apps Script Base64
            if (!loadingTask && item.id && GOOGLE_DRIVE_ENDPOINT && GOOGLE_DRIVE_ENDPOINT.includes('script.google.com')) {
                readerLoadingText.innerText = 'Solicitando archivo a Google Apps Script...';
                const fetchUrl = `${GOOGLE_DRIVE_ENDPOINT}?id=${item.id}`;
                const res = await fetch(fetchUrl);
                const fileData = await res.json();

                if (fileData.error) throw new Error(fileData.error);

                if (fileData.base64) {
                    const pdfData = base64ToUint8Array(fileData.base64);
                    setCachedPDF(item.id, { data: pdfData });
                    loadingTask = pdfjsLib.getDocument({
                        data: pdfData,
                        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                        cMapPacked: true
                    });
                }
            }

            // PASO D: Fallback final a URL directa
            if (!loadingTask) {
                const targetUrl = item.id ? `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}` : (item.url || item.pdf);
                if (!targetUrl) throw new Error('No se pudo encontrar una fuente válida para el documento PDF.');

                loadingTask = pdfjsLib.getDocument({
                    url: targetUrl,
                    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                    cMapPacked: true
                });
            }

            const pdf = await loadingTask.promise;
            const numPages = pdf.numPages;
            const renderScale = 1.25;

            // 1. Crear inmediatamente estructura <img> con placeholder SVG
            flipbookEl.innerHTML = '';
            for (let p = 1; p <= numPages; p++) {
                const pageDiv = document.createElement('div');
                pageDiv.className = 'page';

                const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 450 630'%3E%3Crect width='450' height='630' fill='%23f8fafc'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='16'%3ECargando pág. ${p}...%3C/text%3E%3C/svg%3E`;
                
                pageDiv.innerHTML = `
                    <div class="page-content">
                        <img id="page-img-${p}" src="${placeholderSvg}" draggable="false" alt="Página ${p}" />
                    </div>
                `;
                flipbookEl.appendChild(pageDiv);
            }

            // 2. Renderizar inmediatamente la portada y la página 1
            readerLoadingText.innerText = 'Renderizando portada...';
            await renderPageContent(pdf, 1, renderScale);
            if (numPages > 1) {
                await renderPageContent(pdf, 2, renderScale);
            }

            // 3. Ocultar pantalla de carga inmediatamente
            readerLoading.classList.add('hidden');

            // 4. Inicializar 3D PageFlip
            pageFlip = new St.PageFlip(flipbookEl, {
                width: 450,
                height: 630,
                size: "stretch",
                minWidth: 320,
                maxWidth: 1000,
                minHeight: 450,
                maxHeight: 1400,
                maxShadowOpacity: 0.5,
                showCover: true,
                mobileScrollSupport: false
            });

            pageFlip.loadFromHTML(document.querySelectorAll('.page'));

            const updatePageIndicator = () => {
                document.getElementById('page-indicator').innerText =
                    `Página ${pageFlip.getCurrentPageIndex() + 1} de ${pageFlip.getPageCount()}`;
            };

            pageFlip.on('flip', (e) => {
                document.getElementById('page-indicator').innerText =
                    `Página ${e.data + 1} de ${pageFlip.getPageCount()}`;
            });

            setTimeout(updatePageIndicator, 100);

            btns.prevPage.onclick = () => pageFlip.flipPrev();
            btns.nextPage.onclick = () => pageFlip.flipNext();

            // 5. Cargar en segundo plano las páginas restantes de forma ligera
            (async () => {
                for (let p = 3; p <= numPages; p++) {
                    if (!views.reader.classList.contains('active')) break;
                    await renderPageContent(pdf, p, renderScale);
                    await new Promise(r => setTimeout(r, 15));
                }
            })();

        } catch (error) {
            console.error('Reader Error Details:', error);
            readerLoading.classList.add('hidden');

            const detailMsg = error && error.message ? error.message : 'Error de procesamiento del PDF';
            alert(`Ocurrió un error al abrir el PDF (${detailMsg}).`);
            switchView('library');
        }
    }
});

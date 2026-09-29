/**
 * FlipBook LABOTEC - Dynamic Google Drive Sync & 3D FlipBook Viewer
 * Optimized for Vercel Deployment
 */

// URL por defecto de tu Google Apps Script (se puede sobrescribir desde el modal de la app o localStorage)
const DEFAULT_GOOGLE_DRIVE_ENDPOINT = '';

document.addEventListener('DOMContentLoaded', () => {
    // Current active endpoint
    let currentDriveEndpoint = localStorage.getItem('GOOGLE_DRIVE_ENDPOINT') || DEFAULT_GOOGLE_DRIVE_ENDPOINT;

    // DOM Elements
    const views = {
        library: document.getElementById('library-view'),
        reader: document.getElementById('reader-view')
    };

    const btns = {
        backLibrary: document.getElementById('btn-back-library'),
        prevPage: document.getElementById('btn-prev'),
        nextPage: document.getElementById('btn-next'),
        fullscreen: document.getElementById('btn-fullscreen'),
        syncHeader: document.getElementById('btn-sync-header'),
        openConfig: document.getElementById('btn-open-config'),
        closeModal: document.getElementById('btn-close-modal'),
        resetEndpoint: document.getElementById('btn-reset-endpoint')
    };

    const searchInput = document.getElementById('search-input');
    const documentsGrid = document.getElementById('documents-grid');
    const librarySubtitle = document.getElementById('library-count-subtitle');
    const readerTitle = document.getElementById('reader-title');
    const readerLoading = document.getElementById('reader-loading');
    const readerLoadingText = document.getElementById('reader-loading-text');

    const modal = document.getElementById('config-modal');
    const configForm = document.getElementById('config-form');
    const inputEndpoint = document.getElementById('input-drive-endpoint');

    let allPublications = [];
    let pageFlip = null;

    init();

    function init() {
        if (inputEndpoint) {
            inputEndpoint.value = currentDriveEndpoint;
        }
        setupEventListeners();
        loadLibrary();
    }

    function setupEventListeners() {
        // Navigation & Actions
        btns.backLibrary.onclick = () => switchView('library');
        btns.syncHeader.onclick = () => {
            btns.syncHeader.disabled = true;
            btns.syncHeader.style.opacity = '0.7';
            loadLibrary().finally(() => {
                btns.syncHeader.disabled = false;
                btns.syncHeader.style.opacity = '1';
            });
        };

        // Search Filter
        if (searchInput) {
            searchInput.oninput = (e) => filterPublications(e.target.value);
        }

        // Modal Controls
        if (btns.openConfig) {
            btns.openConfig.onclick = () => {
                inputEndpoint.value = currentDriveEndpoint;
                modal.classList.remove('hidden');
            };
        }

        if (btns.closeModal) {
            btns.closeModal.onclick = () => modal.classList.add('hidden');
        }

        window.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };

        if (configForm) {
            configForm.onsubmit = (e) => {
                e.preventDefault();
                const newUrl = inputEndpoint.value.trim();
                currentDriveEndpoint = newUrl;
                localStorage.setItem('GOOGLE_DRIVE_ENDPOINT', newUrl);
                modal.classList.add('hidden');
                loadLibrary();
            };
        }

        if (btns.resetEndpoint) {
            btns.resetEndpoint.onclick = () => {
                localStorage.removeItem('GOOGLE_DRIVE_ENDPOINT');
                currentDriveEndpoint = DEFAULT_GOOGLE_DRIVE_ENDPOINT;
                inputEndpoint.value = currentDriveEndpoint;
                modal.classList.add('hidden');
                loadLibrary();
            };
        }

        // Fullscreen Toggle
        btns.fullscreen.onclick = () => {
            const wrapper = document.querySelector('.flipbook-wrapper');
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
            } else {
                document.exitFullscreen();
            }
        };
    }

    function switchView(viewName) {
        if (viewName !== 'reader' && pageFlip) {
            try { pageFlip.destroy(); } catch (e) {}
            pageFlip = null;
        }
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    // Convert Base64 string to Uint8Array
    function base64ToUint8Array(base64) {
        const raw = atob(base64);
        const uint8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            uint8Array[i] = raw.charCodeAt(i);
        }
        return uint8Array;
    }

    // Load Publications automatically from Google Apps Script Endpoint
    async function loadLibrary() {
        documentsGrid.innerHTML = `
            <div class="loading-docs">
                <div class="spinner"></div>
                <p>Cargando publicaciones desde Google Drive...</p>
            </div>
        `;

        librarySubtitle.innerText = 'Sincronizando catálogo con Google Drive...';
        allPublications = [];

        // Check if endpoint is direct drive folder link instead of Web App
        if (currentDriveEndpoint.includes('drive.google.com/drive/folders')) {
            renderConfigWarning('Enlace directo de Google Drive detectado', 'En la configuración colocaste el enlace directo de la carpeta de Google Drive en lugar de la URL de tu Google Apps Script (Web App).');
            return;
        }

        // 1. Fetch list from Google Apps Script Endpoint
        if (currentDriveEndpoint && currentDriveEndpoint.includes('script.google.com')) {
            try {
                const res = await fetch(currentDriveEndpoint);
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

        // 2. Fallback to catalogs.json if no endpoint or endpoint returned empty
        if ((!allPublications || allPublications.length === 0) && !currentDriveEndpoint) {
            try {
                const res = await fetch('catalogs.json');
                if (res.ok) {
                    allPublications = await res.json();
                }
            } catch (e) {
                console.log('No local catalogs.json available');
            }
        }

        filterPublications(searchInput ? searchInput.value : '');
    }

    function renderConfigWarning(title, message) {
        librarySubtitle.innerText = 'Configuración requerida';
        documentsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 2.5rem 1.5rem; max-width: 680px; margin: 1rem auto; backdrop-filter: blur(12px);">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚙️</div>
                <h3 style="color: #f87171; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem;">${title}</h3>
                <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">${message}</p>
                <button class="btn primary" onclick="document.getElementById('btn-open-config').click()">
                    Configurar Google Drive Ahora
                </button>
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
            if (!currentDriveEndpoint && allPublications.length === 0) {
                librarySubtitle.innerText = 'Configura tu URL de Google Apps Script para comenzar';
            } else {
                librarySubtitle.innerText = `${filtered.length} publicación(es) disponible(s) en tiempo real`;
            }
        }

        renderLibraryGrid(filtered);
    }

    async function renderLibraryGrid(items) {
        documentsGrid.innerHTML = '';

        if (!items || items.length === 0) {
            if (!currentDriveEndpoint && allPublications.length === 0) {
                renderConfigWarning('Conecta tu carpeta de Google Drive', 'Presiona el botón "Configurar Drive" en la barra superior y coloca la URL de tu Google Apps Script para listar tus archivos PDF automáticamente.');
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

            // Default cover state
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

            card.onclick = () => openReaderForDocument(item);
            documentsGrid.appendChild(card);
        }
    }

    // Reader Functionality with 3D FlipBook
    async function openReaderForDocument(item) {
        readerTitle.innerText = item.title || 'Publicación PDF';
        switchView('reader');

        readerLoading.classList.remove('hidden');
        readerLoadingText.innerText = 'Obteniendo documento desde Google Drive...';

        const wrapper = document.querySelector('.flipbook-wrapper');
        wrapper.innerHTML = '<div id="flipbook" class="flipbook"></div>';
        const flipbookEl = document.getElementById('flipbook');

        try {
            let pdfData = null;

            // Fetch base64 from Google Apps Script Endpoint
            if (item.id && currentDriveEndpoint && currentDriveEndpoint.includes('script.google.com')) {
                const fetchUrl = `${currentDriveEndpoint}?id=${item.id}`;
                const res = await fetch(fetchUrl);
                const fileData = await res.json();
                
                if (fileData.error) throw new Error(fileData.error);
                if (fileData.base64) {
                    pdfData = base64ToUint8Array(fileData.base64);
                } else if (fileData.url) {
                    pdfData = fileData.url;
                }
            } else {
                pdfData = item.url || item.pdf;
            }

            if (!pdfData) throw new Error('No se pudo obtener el archivo PDF desde Google Drive.');

            readerLoadingText.innerText = 'Procesando páginas para el visor 3D...';

            const loadingTask = pdfjsLib.getDocument({
                data: typeof pdfData !== 'string' ? pdfData : undefined,
                url: typeof pdfData === 'string' ? pdfData : undefined,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            });

            const pdf = await loadingTask.promise;
            const numPages = pdf.numPages;
            const scale = 1.6;

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                readerLoadingText.innerText = `Renderizando página ${pageNum} de ${numPages}...`;

                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: ctx, viewport }).promise;

                const pageDiv = document.createElement('div');
                pageDiv.className = 'page';
                pageDiv.innerHTML = `
                    <div class="page-content">
                        <img src="${canvas.toDataURL('image/jpeg', 0.88)}" draggable="false" alt="Página ${pageNum}" />
                    </div>
                `;
                flipbookEl.appendChild(pageDiv);
            }

            readerLoading.classList.add('hidden');

            // Initialize 3D PageFlip
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

        } catch (error) {
            console.error('Reader Error:', error);
            readerLoading.classList.add('hidden');
            alert('Ocurrió un error al abrir el PDF. Verifica que el archivo esté compartido públicamente en Google Drive.');
            switchView('library');
        }
    }
});

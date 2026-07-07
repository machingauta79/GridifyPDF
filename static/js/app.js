// JavaScript Logic for PDF Page Collage & Organizer

// Application State
let state = {
    uploadedPages: [], // All pages extracted from uploaded files
    collages: {
        'default': {
            name: 'Main Collage',
            pages: [] // list of active page configs in this collage
        }
    },
    activeCollageId: 'default',
    canvasZoomLevel: 100
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    initUploadZone();
    initEventListeners();
    renderAll();
});

// Load state from local storage (if exists)
function loadStateFromStorage() {
    const savedState = localStorage.getItem('pdf_collage_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            if (parsed.uploadedPages) state.uploadedPages = parsed.uploadedPages;
            if (parsed.collages) state.collages = parsed.collages;
            if (parsed.activeCollageId) state.activeCollageId = parsed.activeCollageId;
            if (parsed.canvasZoomLevel) state.canvasZoomLevel = parsed.canvasZoomLevel;
            
            // Ensure active collage exists in collages
            if (!state.collages[state.activeCollageId]) {
                state.activeCollageId = Object.keys(state.collages)[0] || 'default';
            }
        } catch (e) {
            console.error("Failed to load saved state", e);
        }
    }
}

// Save state to local storage
function saveState() {
    localStorage.setItem('pdf_collage_state', JSON.stringify(state));
    updateSummary();
}

// Notification Helper
function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    
    let iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-circle-exclamation';
    else if (type === 'info') iconClass = 'fa-circle-info';
    
    notif.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notif);
    
    // Slide out and remove
    setTimeout(() => {
        notif.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

// Show/Hide Spinner
function setLoader(show, message = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    const msgEl = document.getElementById('loading-message');
    msgEl.innerText = message;
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Initialize File Upload Dropzone
function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    
    zone.addEventListener('click', () => input.click());
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
    
    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            handleFiles(input.files);
        }
    });
}

// Upload Files to Backend
async function handleFiles(files) {
    const formData = new FormData();
    let hasPdf = false;
    
    for (let i = 0; i < files.length; i++) {
        if (files[i].type === 'application/pdf' || files[i].name.toLowerCase().endswith('.pdf')) {
            formData.append('files', files[i]);
            hasPdf = true;
        }
    }
    
    if (!hasPdf) {
        showNotification("Please upload PDF files only.", "danger");
        return;
    }
    
    setLoader(true, "Extracting PDF pages...");
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Upload failed");
        }
        
        const data = await response.json();
        
        // Append newly uploaded pages to state
        state.uploadedPages = [...state.uploadedPages, ...data.pages];
        saveState();
        renderPagesPool();
        showNotification(`Successfully loaded ${data.pages.length} pages!`);
    } catch (err) {
        showNotification(err.message, "danger");
    } finally {
        setLoader(false);
    }
}

// Render Left Panel Page Pool
function renderPagesPool() {
    const pool = document.getElementById('pages-pool');
    pool.innerHTML = '';
    
    if (state.uploadedPages.length === 0) {
        pool.innerHTML = `
            <div class="pool-empty-state">
                <i class="fa-solid fa-file-pdf"></i>
                <p>No documents uploaded yet.</p>
                <span>Upload files to extract pages.</span>
            </div>
        `;
        return;
    }
    
    // Group pages by document
    const docs = {};
    state.uploadedPages.forEach(p => {
        if (!docs[p.doc_id]) {
            docs[p.doc_id] = {
                name: p.doc_name,
                pages: []
            };
        }
        docs[p.doc_id].pages.push(p);
    });
    
    // Render group accordions
    Object.keys(docs).forEach(docId => {
        const doc = docs[docId];
        // Sort pages just in case
        doc.pages.sort((a, b) => a.page_num - b.page_num);
        
        const groupEl = document.createElement('div');
        groupEl.className = 'pool-doc-group';
        
        const headerEl = document.createElement('div');
        headerEl.className = 'pool-doc-header';
        headerEl.innerHTML = `
            <div class="pool-doc-info">
                <i class="fa-solid fa-file-pdf"></i>
                <span class="pool-doc-name" title="${doc.name}">${doc.name}</span>
            </div>
            <div>
                <span class="pool-doc-count">${doc.pages.length} pgs</span>
                <i class="fa-solid fa-chevron-down pool-doc-chevron"></i>
            </div>
        `;
        
        const pagesEl = document.createElement('div');
        pagesEl.className = 'pool-doc-pages';
        
        doc.pages.forEach(p => {
            const pageItem = document.createElement('div');
            pageItem.className = 'pool-page-item';
            pageItem.innerHTML = `
                <div class="pool-page-img-wrapper">
                    <img src="${p.thumbnail_url}" alt="Page ${p.page_num + 1}" loading="lazy">
                </div>
                <div class="pool-page-number">Page ${p.page_num + 1}</div>
                <div class="pool-page-add-overlay">
                    <i class="fa-solid fa-plus"></i>
                </div>
            `;
            
            // Add page on click
            pageItem.addEventListener('click', () => {
                addPageToCollage(p);
            });
            
            pagesEl.appendChild(pageItem);
        });
        
        // Collapse toggle listener
        headerEl.addEventListener('click', () => {
            groupEl.classList.toggle('collapsed');
        });
        
        groupEl.appendChild(headerEl);
        groupEl.appendChild(pagesEl);
        pool.appendChild(groupEl);
    });
}

// Add page from pool into the active collage workspace
function addPageToCollage(poolPage) {
    const activeCollage = state.collages[state.activeCollageId];
    
    // Generate unique card ID for active workspace to allow duplicate pages
    const cardId = `card_${uuid()}`;
    
    activeCollage.pages.push({
        id: cardId,
        doc_id: poolPage.doc_id,
        doc_name: poolPage.doc_name,
        doc_filename: poolPage.doc_filename,
        page_num: poolPage.page_num,
        rotation: 0,
        label: '',
        thumbnail_url: poolPage.thumbnail_url
    });
    
    saveState();
    renderCanvas();
    showNotification("Added page to collage.");
}

// Render active collage workspace canvas
function renderCanvas() {
    const grid = document.getElementById('collage-grid');
    grid.innerHTML = '';
    applyCanvasZoom();
    
    const activeCollage = state.collages[state.activeCollageId];
    const pages = activeCollage ? activeCollage.pages : [];
    
    document.getElementById('workbench-status').innerText = `${pages.length} page${pages.length === 1 ? '' : 's'} in collage`;
    
    if (pages.length === 0) {
        grid.innerHTML = `
            <div class="canvas-empty-state">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <p>Your collage is empty</p>
                <span>Click pages in the left sidebar or drag them here to start building your collage.</span>
            </div>
        `;
        return;
    }
    
    pages.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-index', idx);
        
        card.innerHTML = `
            <div class="page-card-header">
                <span class="page-card-title" title="${p.doc_name}">${p.doc_name}</span>
                <div style="display: flex; align-items: center;">
                    <button class="page-card-zoom" title="Zoom/Preview Page">
                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                    </button>
                    <button class="page-card-remove" title="Remove Page">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="page-card-body">
                <div class="page-card-img-container" style="transform: rotate(${p.rotation}deg)">
                    <img src="${p.thumbnail_url}" alt="Page" draggable="false">
                </div>
                <div class="page-card-rotation-indicator">${p.rotation}°</div>
            </div>
            <div class="page-card-footer">
                <div class="page-card-controls">
                    <input type="text" class="page-card-label-input" placeholder="Add label..." value="${p.label || ''}">
                    <button class="page-card-rotate-btn" title="Rotate Clockwise">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Listeners for Card Operations
        // 0. Zoom/Preview Page
        card.querySelector('.page-card-zoom').addEventListener('click', (e) => {
            e.stopPropagation();
            openPreviewModal(p, idx);
        });
        
        // 1. Remove Page
        card.querySelector('.page-card-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            pages.splice(idx, 1);
            saveState();
            renderCanvas();
        });
        
        // 2. Rotate Page
        card.querySelector('.page-card-rotate-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            p.rotation = (p.rotation + 90) % 360;
            saveState();
            
            // Visual rotation update without full re-render
            const imgContainer = card.querySelector('.page-card-img-container');
            const rotIndicator = card.querySelector('.page-card-rotation-indicator');
            imgContainer.style.transform = `rotate(${p.rotation}deg)`;
            rotIndicator.innerText = `${p.rotation}°`;
        });
        
        // 3. Label Input
        const labelInput = card.querySelector('.page-card-label-input');
        labelInput.addEventListener('input', () => {
            p.label = labelInput.value;
            saveState(); // Saves state silently on keystroke
        });
        
        // Drag and Drop Events for Reordering
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', idx);
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            grid.classList.remove('dragover-indicator');
        });
        
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            grid.classList.add('dragover-indicator');
        });
        
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const destIdx = idx;
            
            if (sourceIdx !== destIdx && !isNaN(sourceIdx)) {
                // Move item in array
                const [movedItem] = pages.splice(sourceIdx, 1);
                pages.splice(destIdx, 0, movedItem);
                saveState();
                renderCanvas();
            }
        });
        
        grid.appendChild(card);
    });
}

// Render Collage Select Dropdown
function renderCollageSelect() {
    const select = document.getElementById('collage-select');
    select.innerHTML = '';
    
    Object.keys(state.collages).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = state.collages[id].name;
        opt.selected = (id === state.activeCollageId);
        select.appendChild(opt);
    });
}

// Update settings and totals summary
function updateSummary() {
    const activeCollage = state.collages[state.activeCollageId];
    const totalPages = activeCollage ? activeCollage.pages.length : 0;
    
    // Count unique source documents in active collage
    const uniqueDocs = new Set();
    if (activeCollage) {
        activeCollage.pages.forEach(p => uniqueDocs.add(p.doc_id));
    }
    
    document.getElementById('summary-total-pages').innerText = totalPages;
    document.getElementById('summary-source-docs').innerText = uniqueDocs.size;
}

// Render everything
function renderAll() {
    renderPagesPool();
    renderCollageSelect();
    renderCanvas();
    updateSummary();
}

// String extension for modern endsWith
if (!String.prototype.endswith) {
    String.prototype.endswith = function(suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

// Helper to generate UUIDs locally
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Initialise Application Event Listeners
function initEventListeners() {
    // Collage Selector change
    const collageSelect = document.getElementById('collage-select');
    collageSelect.addEventListener('change', () => {
        state.activeCollageId = collageSelect.value;
        saveState();
        renderCanvas();
        updateSummary();
    });
    
    // Create new Collage button
    const btnNew = document.getElementById('btn-new-collage');
    btnNew.addEventListener('click', () => {
        showModal('New Collage Name', 'My New Collage', (newName) => {
            if (newName.trim()) {
                const newId = `collage_${uuid()}`;
                state.collages[newId] = {
                    name: newName.trim(),
                    pages: []
                };
                state.activeCollageId = newId;
                saveState();
                renderAll();
                showNotification(`Created collage "${newName.trim()}"`);
            }
        });
    });
    
    // Rename active Collage button
    const btnRename = document.getElementById('btn-rename-collage');
    btnRename.addEventListener('click', () => {
        const currentName = state.collages[state.activeCollageId].name;
        showModal('Rename Collage', currentName, (newName) => {
            if (newName.trim() && newName.trim() !== currentName) {
                state.collages[state.activeCollageId].name = newName.trim();
                saveState();
                renderCollageSelect();
                showNotification(`Renamed collage to "${newName.trim()}"`);
            }
        });
    });
    
    // Add All from Pool to Canvas
    const btnAddAll = document.getElementById('btn-add-all-pool');
    btnAddAll.addEventListener('click', () => {
        if (state.uploadedPages.length === 0) {
            showNotification("No pages available to add. Upload some PDFs first.", "info");
            return;
        }
        
        const activeCollage = state.collages[state.activeCollageId];
        state.uploadedPages.forEach(p => {
            const cardId = `card_${uuid()}`;
            activeCollage.pages.push({
                id: cardId,
                doc_id: p.doc_id,
                doc_name: p.doc_name,
                doc_filename: p.doc_filename,
                page_num: p.page_num,
                rotation: 0,
                label: '',
                thumbnail_url: p.thumbnail_url
            });
        });
        
        saveState();
        renderCanvas();
        showNotification(`Added all ${state.uploadedPages.length} pages to the collage.`);
    });
    
    // Clear Canvas button
    const btnClear = document.getElementById('btn-clear-canvas');
    btnClear.addEventListener('click', () => {
        const activeCollage = state.collages[state.activeCollageId];
        if (activeCollage && activeCollage.pages.length > 0) {
            if (confirm("Are you sure you want to clear all pages in this collage?")) {
                activeCollage.pages = [];
                saveState();
                renderCanvas();
                showNotification("Cleared collage workspace.");
            }
        }
    });
    
    // View Toggles (Grid vs Filmstrip vs List)
    const viewGridBtn = document.getElementById('view-grid');
    const viewFilmstripBtn = document.getElementById('view-filmstrip');
    const viewListBtn = document.getElementById('view-list');
    const gridEl = document.getElementById('collage-grid');
    
    viewGridBtn.addEventListener('click', () => {
        viewGridBtn.classList.add('active');
        viewFilmstripBtn.classList.remove('active');
        viewListBtn.classList.remove('active');
        gridEl.className = 'collage-grid grid-mode';
    });
    
    viewFilmstripBtn.addEventListener('click', () => {
        viewFilmstripBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        viewListBtn.classList.remove('active');
        gridEl.className = 'collage-grid filmstrip-mode';
    });
    
    viewListBtn.addEventListener('click', () => {
        viewListBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        viewFilmstripBtn.classList.remove('active');
        gridEl.className = 'collage-grid list-mode';
    });
    
    // Export settings format change listeners
    const formatRadios = document.querySelectorAll('input[name="export-format"]');
    const columnsGroup = document.getElementById('image-columns-group');
    
    formatRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'image') {
                columnsGroup.style.display = 'flex';
            } else {
                columnsGroup.style.display = 'none';
            }
        });
    });
    
    // Export Button execution
    const btnExport = document.getElementById('btn-export');
    btnExport.addEventListener('click', executeExport);
    
    // Canvas Zooming Listeners
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    
    btnZoomIn.addEventListener('click', () => {
        if (state.canvasZoomLevel < 160) {
            state.canvasZoomLevel += 20;
            saveState();
            applyCanvasZoom();
        }
    });
    
    btnZoomOut.addEventListener('click', () => {
        if (state.canvasZoomLevel > 60) {
            state.canvasZoomLevel -= 20;
            saveState();
            applyCanvasZoom();
        }
    });

    // Preview Modal operations
    initPreviewModalListeners();
}

// Custom Modal management
let modalResolve = null;
function showModal(title, defaultValue, callback) {
    const modal = document.getElementById('rename-modal');
    const titleEl = modal.querySelector('h3');
    const input = document.getElementById('rename-input');
    
    titleEl.innerText = title;
    input.value = defaultValue;
    modal.classList.add('active');
    input.focus();
    input.select();
    
    modalResolve = callback;
}

// Modal actions
document.getElementById('btn-rename-save').addEventListener('click', () => {
    const val = document.getElementById('rename-input').value;
    document.getElementById('rename-modal').classList.remove('active');
    if (modalResolve) modalResolve(val);
});

document.getElementById('btn-rename-cancel').addEventListener('click', () => {
    document.getElementById('rename-modal').classList.remove('active');
    modalResolve = null;
});

// Execute export
async function executeExport() {
    const activeCollage = state.collages[state.activeCollageId];
    if (!activeCollage || activeCollage.pages.length === 0) {
        showNotification("Your collage is empty! Add pages before exporting.", "danger");
        return;
    }
    
    const title = document.getElementById('export-title').value.trim() || activeCollage.name;
    const format = document.querySelector('input[name="export-format"]:checked').value;
    const columns = parseInt(document.getElementById('export-columns').value);
    const burnLabels = document.getElementById('export-burn-labels').checked;
    
    setLoader(true, `Compiling your ${format.toUpperCase()} collage...`);
    
    try {
        const payload = {
            pages: activeCollage.pages,
            options: {
                columns: columns,
                burn_labels: burnLabels,
                format: format,
                collage_title: title
            }
        };
        
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Export failed");
        }
        
        const blob = await response.blob();
        
        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const ext = format === 'pdf' ? 'pdf' : 'png';
        a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`Successfully exported as ${format.toUpperCase()}!`);
    } catch (err) {
        showNotification(err.message, "danger");
    } finally {
        setLoader(false);
    }
}

// Canvas Zoom Adjuster
function applyCanvasZoom() {
    const grid = document.getElementById('collage-grid');
    const zoomVal = document.getElementById('zoom-value');
    if (!grid || !zoomVal) return;
    
    zoomVal.innerText = `${state.canvasZoomLevel}%`;
    
    // Convert 100% -> 200px. Standard bounds: 60% (120px) to 140% (280px).
    const width = 200 * (state.canvasZoomLevel / 100);
    grid.style.setProperty('--card-width', `${width}px`);
}

// Active Preview Page Index
let activePreviewIdx = null;

// Open Page Zoom Preview Modal
function openPreviewModal(page, idx) {
    activePreviewIdx = idx;
    const modal = document.getElementById('preview-modal');
    const title = document.getElementById('preview-modal-title');
    const img = document.getElementById('preview-modal-img');
    const info = document.getElementById('preview-modal-doc-info');
    
    if (!modal || !title || !img || !info) return;
    
    title.innerText = `Preview: ${page.doc_name}`;
    img.src = page.thumbnail_url;
    
    // Reset zoom state on open to fit
    const imgContainer = modal.querySelector('.preview-img-container');
    if (imgContainer) {
        imgContainer.classList.remove('zoomed');
        imgContainer.style.transform = `rotate(${page.rotation}deg)`;
    }
    
    // Reset image width style
    img.style.width = '';
    
    // Reset slider to 100%
    const slider = document.getElementById('preview-zoom-slider');
    const valEl = document.getElementById('preview-zoom-val');
    if (slider && valEl) {
        slider.value = 100;
        valEl.innerText = '100%';
    }
    
    // Reset active class on Fit button
    const btnFit = document.getElementById('btn-prev-zoom-fit');
    if (btnFit) {
        btnFit.classList.add('active');
    }
    
    info.innerText = `${page.doc_name} — Page ${page.page_num + 1}`;
    
    // Update navigation buttons
    const activeCollage = state.collages[state.activeCollageId];
    const pages = activeCollage ? activeCollage.pages : [];
    
    const prevBtn = document.getElementById('btn-preview-prev');
    const nextBtn = document.getElementById('btn-preview-next');
    
    if (prevBtn && nextBtn) {
        prevBtn.disabled = (idx === 0);
        nextBtn.disabled = (idx === pages.length - 1);
    }
    
    modal.classList.add('active');
}

// Setup Page Zoom Preview Modal actions
function initPreviewModalListeners() {
    const modal = document.getElementById('preview-modal');
    const closeBtn = document.getElementById('btn-preview-close');
    const rotateLeft = document.getElementById('btn-preview-rotate-left');
    const rotateRight = document.getElementById('btn-preview-rotate-right');
    const prevBtn = document.getElementById('btn-preview-prev');
    const nextBtn = document.getElementById('btn-preview-next');
    const imgContainer = modal ? modal.querySelector('.preview-img-container') : null;
    
    // Zoom controls
    const btnFit = document.getElementById('btn-prev-zoom-fit');
    const slider = document.getElementById('preview-zoom-slider');
    const valEl = document.getElementById('preview-zoom-val');
    const img = document.getElementById('preview-modal-img');
    
    if (!modal || !closeBtn || !rotateLeft || !rotateRight || !prevBtn || !nextBtn || !btnFit || !slider || !valEl || !img) return;
    
    const applySliderZoom = () => {
        if (!imgContainer) return;
        const val = slider.value;
        valEl.innerText = `${val}%`;
        
        imgContainer.classList.add('zoomed');
        img.style.width = `${val}%`;
        
        // Remove active class from Fit button
        btnFit.classList.remove('active');
    };
    
    const closePreview = () => {
        modal.classList.remove('active');
        activePreviewIdx = null;
        if (imgContainer) {
            imgContainer.classList.remove('zoomed');
        }
        img.style.width = '';
    };
    
    closeBtn.addEventListener('click', closePreview);
    
    // Close on click outside content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePreview();
        }
    });
    
    // Bind slider input events
    slider.addEventListener('input', applySliderZoom);
    slider.addEventListener('change', applySliderZoom);
    
    // Fit button resets zoom state
    btnFit.addEventListener('click', (e) => {
        e.stopPropagation();
        if (imgContainer) {
            imgContainer.classList.remove('zoomed');
        }
        img.style.width = '';
        slider.value = 100;
        valEl.innerText = '100%';
        btnFit.classList.add('active');
    });
    
    // Click image container to cycle zoom scroll states
    if (imgContainer) {
        imgContainer.addEventListener('click', (e) => {
            const currentVal = parseInt(slider.value);
            if (!imgContainer.classList.contains('zoomed')) {
                // Fit -> go to 100%
                slider.value = 100;
                applySliderZoom();
            } else if (currentVal >= 100 && currentVal < 150) {
                // 100% -> go to 150%
                slider.value = 150;
                applySliderZoom();
            } else {
                // Reset back to Fit
                imgContainer.classList.remove('zoomed');
                img.style.width = '';
                slider.value = 100;
                valEl.innerText = '100%';
                btnFit.classList.add('active');
            }
        });
    }
    
    // Navigate to previous page
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pages = state.collages[state.activeCollageId].pages;
        if (activePreviewIdx !== null && activePreviewIdx > 0) {
            openPreviewModal(pages[activePreviewIdx - 1], activePreviewIdx - 1);
        }
    });
    
    // Navigate to next page
    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pages = state.collages[state.activeCollageId].pages;
        if (activePreviewIdx !== null && activePreviewIdx < pages.length - 1) {
            openPreviewModal(pages[activePreviewIdx + 1], activePreviewIdx + 1);
        }
    });
    
    // Keyboard navigation support
    document.addEventListener('keydown', (e) => {
        if (modal.classList.contains('active')) {
            const pages = state.collages[state.activeCollageId].pages;
            if (e.key === 'ArrowLeft' && activePreviewIdx !== null && activePreviewIdx > 0) {
                openPreviewModal(pages[activePreviewIdx - 1], activePreviewIdx - 1);
            } else if (e.key === 'ArrowRight' && activePreviewIdx !== null && activePreviewIdx < pages.length - 1) {
                openPreviewModal(pages[activePreviewIdx + 1], activePreviewIdx + 1);
            } else if (e.key === 'Escape') {
                closePreview();
            }
        }
    });
    
    rotateLeft.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent toggling zoom when clicking rotate buttons
        if (activePreviewIdx !== null) {
            const pages = state.collages[state.activeCollageId].pages;
            const p = pages[activePreviewIdx];
            p.rotation = (p.rotation - 90 + 360) % 360;
            saveState();
            
            // Visual rotation in modal
            if (imgContainer) {
                imgContainer.style.transform = `rotate(${p.rotation}deg)`;
            }
            
            // Refresh canvas in background to sync
            renderCanvas();
        }
    });
    
    rotateRight.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent toggling zoom when clicking rotate buttons
        if (activePreviewIdx !== null) {
            const pages = state.collages[state.activeCollageId].pages;
            const p = pages[activePreviewIdx];
            p.rotation = (p.rotation + 90) % 360;
            saveState();
            
            // Visual rotation in modal
            if (imgContainer) {
                imgContainer.style.transform = `rotate(${p.rotation}deg)`;
            }
            
            // Refresh canvas in background to sync
            renderCanvas();
        }
    });
}

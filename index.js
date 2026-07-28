// Global Error Handler Banner for easy front-end debugging
window.addEventListener("error", (event) => {
    console.error("Caught global error:", event.error);
    const errorBanner = document.createElement("div");
    errorBanner.style.position = "fixed";
    errorBanner.style.bottom = "20px";
    errorBanner.style.left = "20px";
    errorBanner.style.right = "20px";
    errorBanner.style.background = "rgba(220, 53, 69, 0.95)";
    errorBanner.style.color = "#fff";
    errorBanner.style.padding = "16px 24px";
    errorBanner.style.borderRadius = "8px";
    errorBanner.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.5)";
    errorBanner.style.zIndex = "999999";
    errorBanner.style.fontFamily = "monospace";
    errorBanner.style.fontSize = "14px";
    errorBanner.style.display = "flex";
    errorBanner.style.flexDirection = "column";
    errorBanner.style.gap = "8px";
    
    errorBanner.innerHTML = `
        <div style="font-weight: bold; font-size: 16px; display: flex; align-items: center; gap: 8px;">
            ⚠️ Runtime JavaScript Error Detected:
        </div>
        <div><strong>Message:</strong> ${event.message}</div>
        <div><strong>File:</strong> ${event.filename}:${event.lineno}:${event.colno}</div>
        <div style="font-size: 12px; opacity: 0.8; white-space: pre-wrap; overflow-x: auto; max-height: 150px;">${event.error ? event.error.stack : 'No stack trace available'}</div>
        <button onclick="this.parentElement.remove()" style="align-self: flex-end; background: transparent; border: 1px solid rgba(255,255,255,0.5); color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Dismiss</button>
    `;
    document.body.appendChild(errorBanner);
});

// Safe Lucide proxy wrapper to prevent network blocks
if (typeof lucide === 'undefined') {
    window.lucide = {
        createIcons: function() { console.warn("Lucide icons script not loaded."); }
    };
} else {
    const originalCreateIcons = lucide.createIcons;
    lucide.createIcons = function() {
        try {
            originalCreateIcons();
        } catch (e) {
            console.warn("Lucide failed to create icons:", e);
        }
    };
}

// Core Application State
let appDatabase = null;
let aosCollection = {}; // Format: "Faction Name:Model Name" -> qty (number)
let aosArmies = [];     // Array of saved army objects
let activeArmy = null;  // The army currently loaded in the builder
let activeRegimentIndex = 0; // The index of the regiment currently selected for adding units
let activeRegimentIndexForDrawer = null;
let activeDrawerType = null; // "hero" or "unit"

// Standard Grand Alliances & Factions Map
const GRAND_ALLIANCES = {
    "GRAND ALLIANCE: ORDER": [
        "CITIES OF SIGMAR", "DAUGHTERS OF KHAINE", "FYRESLAYERS", "IDONETH DEEPKIN",
        "KHARADRON OVERLORDS", "LUMINETH REALM-LORDS", "SERAPHON", "STORMCAST ETERNALS",
        "SYLVANETH"
    ],
    "GRAND ALLIANCE: CHAOS": [
        "BLADES OF KHORNE", "DISCIPLES OF TZEENTCH", "HEDONITES OF SLAANESH",
        "MAGGOTKIN OF NURGLE", "SKAVEN", "SLAVES TO DARKNESS", "HELSMITHS OF HASHUT"
    ],
    "GRAND ALLIANCE: DEATH": [
        "FLESH-EATER COURTS", "NIGHTHAUNT", "OSSIARCH BONEREAPERS", "SOULBLIGHT GRAVELORDS"
    ],
    "GRAND ALLIANCE: DESTRUCTION": [
        "GLOOMSPITE GITZ", "IRONJAWZ", "KRULEBOYZ", "OGOR MAWTRIBES", "SONS OF BEHEMAT"
    ]
};

const CORE_FACTIONS = Object.values(GRAND_ALLIANCES).flat();

// Initialize Application on DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    setupTabNavigation();
    setupSidebarCollapse();
    setupDialogListeners();
    setupCollectionListeners();
    setupBuilderListeners();
    setupPdfDropZone();
    loadAppDatabase();
    
    // Initialize Game Tracker
    loadTrackerState();
    setupTrackerListeners();
});

// Setup SPA Tab Navigation
function setupTabNavigation() {
    const navButtons = document.querySelectorAll(".nav-btn");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Handle premium Back to Armies button click
    const backBtn = document.getElementById("btnBackToArmies");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            switchTab("dashboard");
        });
    }
}

// Setup Collapsible Sidebar Navigation
function setupSidebarCollapse() {
    const btnToggleSidebar = document.getElementById("btnToggleSidebar");
    const container = document.querySelector(".app-container");
    
    // Check local storage for saved collapsed state
    const isCollapsed = localStorage.getItem("aos_sidebar_collapsed") === "true";
    if (isCollapsed && container) {
        container.classList.add("collapsed");
        if (btnToggleSidebar) {
            btnToggleSidebar.innerHTML = `<i data-lucide="chevron-right"></i>`;
        }
    }
    
    if (btnToggleSidebar && container) {
        btnToggleSidebar.addEventListener("click", () => {
            const collapsed = container.classList.toggle("collapsed");
            localStorage.setItem("aos_sidebar_collapsed", collapsed);
            
            // Update button icon
            btnToggleSidebar.innerHTML = collapsed ? 
                `<i data-lucide="chevron-right"></i>` : 
                `<i data-lucide="chevron-left"></i>`;
                
            lucide.createIcons();
        });
    }
}

// Global Programmatic SPA Tab Switcher State Machine
function switchTab(targetTab) {
    const navButtons = document.querySelectorAll(".nav-btn");
    const panels = document.querySelectorAll(".tab-panel");

    navButtons.forEach(b => b.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));

    // Activate the panel container
    const panel = document.getElementById(`tab-${targetTab}`);
    if (panel) panel.classList.add("active");

    // Highlight correct navigation option in sidebar
    if (targetTab === "builder" || targetTab === "dashboard") {
        // Keep the "Armies" (dashboard) tab button highlighted as active in either view state
        const armiesBtn = document.querySelector(".nav-btn[data-tab='dashboard']");
        if (armiesBtn) armiesBtn.classList.add("active");
    } else {
        const btn = document.querySelector(`.nav-btn[data-tab='${targetTab}']`);
        if (btn) btn.classList.add("active");
    }

    // Toggle Back to Armies button visibility in top-bar
    const backBtn = document.getElementById("btnBackToArmies");
    if (backBtn) {
        if (targetTab === "builder") {
            backBtn.classList.remove("hidden");
        } else {
            backBtn.classList.add("hidden");
        }
    }

    // Toggle main top-bar visibility (hide completely inside Game Tracker mode)
    const topBar = document.querySelector(".top-bar");
    if (topBar) {
        if (targetTab === "tracker") {
            topBar.classList.add("hidden");
        } else {
            topBar.classList.remove("hidden");
        }
    }

    // Trigger target tab's render workflow
    if (targetTab === "dashboard") {
        renderSavedArmies();
    } else if (targetTab === "collection") {
        renderCollection();
    } else if (targetTab === "builder") {
        populateFactionDropdowns();
        renderBuilder();
    } else if (targetTab === "tracker") {
        renderTracker();
    }
}
window.switchTab = switchTab;

// Load Rules Database (preloaded JSON or localStorage custom rules or PostgreSQL backend)
async function loadAppDatabase() {
    try {
        console.log("Fetching rules database from PostgreSQL backend...");
        const response = await fetch('/api/database');
        if (response.ok) {
            appDatabase = await response.json();
            console.log("Successfully loaded database from PostgreSQL backend.");
        } else {
            throw new Error(`Server returned status ${response.status}`);
        }
    } catch (err) {
        console.warn("Failed to load database from Postgres backend. Falling back to local storage and static file:", err);
        const customDb = localStorage.getItem("aos_custom_database");
        if (customDb) {
            appDatabase = JSON.parse(customDb);
            console.log("Loaded custom database fallback from localStorage.");
        } else if (typeof DEFAULT_BATTLE_PROFILES !== 'undefined') {
            appDatabase = DEFAULT_BATTLE_PROFILES;
            console.log("Loaded static fallback database from database.js.");
        } else {
            const response = await fetch("./battle_profiles.json");
            appDatabase = await response.json();
            console.log("Loaded default database fallback from battle_profiles.json.");
        }
    }
    
    try {
        // Load collection & armies
        loadLocalStorageData();
        
        // Initial dashboard render
        renderSavedArmies();
        populateFactionDropdowns();
    } catch (err) {
        console.error("Failed to load rules database state:", err);
    }
}

// Load Local Storage Data with full normalization and key sanitation
function loadLocalStorageData() {
    const savedCollection = localStorage.getItem("aos_collection");
    if (savedCollection) {
        try {
            const rawCollection = JSON.parse(savedCollection);
            aosCollection = {};
            
            // Normalize keys to "UPPERCASE_FACTION:Model_Name" with trimmed fields
            for (const key in rawCollection) {
                const qty = rawCollection[key];
                if (qty > 0) {
                    const parts = key.split(":");
                    if (parts.length > 1) {
                        const normalizedFaction = parts[0].trim().toUpperCase();
                        let normalizedModel = parts[1].trim();
                        
                        // Migrate legacy Sylvaneth Kurnoth Hunters names
                        if (normalizedFaction === "SYLVANETH") {
                            const cleanModelName = normalizedModel.replace(/\s+/g, " ").trim();
                            if (cleanModelName === "Greatbows") {
                                normalizedModel = "Kurnoth Hunters with Greatbows";
                            } else if (cleanModelName === "with Greatswords") {
                                normalizedModel = "Kurnoth Hunters with Greatswords";
                            } else if (cleanModelName === "with Greatscythes") {
                                normalizedModel = "Kurnoth Hunters with Greatscythes";
                            }
                        }
                        
                        const newKey = `${normalizedFaction}:${normalizedModel}`;
                        
                        // Sum quantities in case of historical duplicate keys
                        aosCollection[newKey] = (aosCollection[newKey] || 0) + qty;
                    }
                }
            }
            // Save sanitized collection back to store
            localStorage.setItem("aos_collection", JSON.stringify(aosCollection));
        } catch (e) {
            console.error("Failed to normalize collection keys:", e);
            aosCollection = {};
        }
    }
    
    const savedArmies = localStorage.getItem("aos_armies");
    if (savedArmies) {
        try {
            const rawArmies = JSON.parse(savedArmies);
            aosArmies = rawArmies.map(army => {
                if (army) {
                    if (army.faction) {
                        // Sanitize faction name in loaded armies
                        army.faction = army.faction.trim().toUpperCase();
                    }
                    // Migrate names inside army regiments
                    if (army.faction === "SYLVANETH" && army.regiments) {
                        army.regiments.forEach(reg => {
                            if (reg.units) {
                                reg.units.forEach(u => {
                                    if (u && u.name) {
                                        const cleanUnitName = u.name.replace(/\s+/g, " ").trim();
                                        if (cleanUnitName === "Greatbows") {
                                            u.name = "Kurnoth Hunters with Greatbows";
                                        } else if (cleanUnitName === "with Greatswords") {
                                            u.name = "Kurnoth Hunters with Greatswords";
                                        } else if (cleanUnitName === "with Greatscythes") {
                                            u.name = "Kurnoth Hunters with Greatscythes";
                                        }
                                    }
                                });
                            }
                        });
                    }
                }
                return army;
            });
            localStorage.setItem("aos_armies", JSON.stringify(aosArmies));
        } catch (e) {
            console.error("Failed to normalize loaded armies:", e);
            aosArmies = [];
        }
    }
}

// Get list of factions where the user owns at least 1 model
function getOwnedFactions() {
    const owned = new Set();
    for (const key in aosCollection) {
        if (aosCollection[key] > 0) {
            const parts = key.split(":");
            if (parts.length > 1) {
                owned.add(parts[0].trim().toUpperCase());
            }
        }
    }
    return Array.from(owned);
}

// Populate Faction Dropdowns across the app
function populateFactionDropdowns() {
    const ownedFactions = getOwnedFactions();
    const hasOwnedModels = ownedFactions.length > 0;

    // 1. My Collection Filter Selector (always show all factions so they can add to any of them)
    const collectionFilter = document.getElementById("collectionFactionFilter");
    if (collectionFilter) {
        populateSingleSelector(collectionFilter, null);
    }

    // 2. Builder/New Army Selectors (limit to factions where they own models, fallback to all if empty)
    const builderSelectors = [
        document.getElementById("builderArmyFaction"),
        document.getElementById("newArmyFactionInput")
    ];

    builderSelectors.forEach(selector => {
        if (!selector) return;
        populateSingleSelector(selector, hasOwnedModels ? ownedFactions : null);
    });
}

// Helper to populate a single dropdown element
function populateSingleSelector(selector, allowedFactions = null) {
    // Preserve initial option if exists
    const firstOption = selector.querySelector("option[disabled]") || selector.querySelector("option[value='']");
    const currentValue = selector.value;
    selector.innerHTML = "";
    if (firstOption) selector.appendChild(firstOption);
    
    for (const alliance in GRAND_ALLIANCES) {
        const groupFactions = GRAND_ALLIANCES[alliance].filter(faction => {
            if (allowedFactions === null) return true; // Allow all
            return allowedFactions.includes(faction);
        });

        if (groupFactions.length > 0) {
            const group = document.createElement("optgroup");
            group.label = alliance;
            
            groupFactions.forEach(faction => {
                const opt = document.createElement("option");
                opt.value = faction;
                opt.textContent = faction;
                group.appendChild(opt);
            });
            
            selector.appendChild(group);
        }
    }
    
    // Try to restore previous selection if it is still valid
    if (currentValue) {
        selector.value = currentValue;
    }
}

// Setup Dialog Focus and Boundaries (Baseline compliant light dismiss fallback)
function setupDialogListeners() {
    const dialogs = document.querySelectorAll("dialog");
    
    dialogs.forEach(dialog => {
        // Apply native click-outside fallback for browsers without <dialog closedby> support
        if (!('closedBy' in HTMLDialogElement.prototype)) {
            dialog.addEventListener("click", (e) => {
                if (e.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                const isInside = (
                    rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                    rect.left <= e.clientX && e.clientX <= rect.left + rect.width
                );
                if (!isInside) dialog.close();
            });
        }
    });
    
    // Create New Army button click
    const btnCreateNewArmy = document.getElementById("btnCreateNewArmy");
    const newArmyDialog = document.getElementById("newArmyDialog");
    
    if (btnCreateNewArmy && newArmyDialog) {
        btnCreateNewArmy.addEventListener("click", () => {
            populateFactionDropdowns();
            document.getElementById("newArmyNameInput").value = ""; // Start blank to show placeholder
            document.getElementById("newArmyFactionInput").value = "";
            document.getElementById("newArmyPointsInput").value = "1000";
            newArmyDialog.showModal();
        });
    }
    
    // Cancel New Army
    const btnCancelNewArmy = document.getElementById("btnCancelNewArmy");
    if (btnCancelNewArmy && newArmyDialog) {
        btnCancelNewArmy.addEventListener("click", () => {
            newArmyDialog.close();
        });
    }
    
    // New Army Submit Action
    const newArmyForm = document.getElementById("newArmyForm");
    if (newArmyForm && newArmyDialog) {
        newArmyForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const nameInput = document.getElementById("newArmyNameInput");
            const name = nameInput.value.trim() || "My Epic Vanguard"; // Support placeholder defaulting
            const faction = document.getElementById("newArmyFactionInput").value;
            const pointsLimit = parseInt(document.getElementById("newArmyPointsInput").value);
            
            if (!faction) {
                alert("Please select a Faction to initialize your army builder!");
                return;
            }
            
            // Create army state with a default regiment as required
            activeArmy = {
                id: generateUUID(),
                name: name,
                faction: faction,
                pointsLimit: pointsLimit,
                regiments: [{ leader: null, units: [] }]
            };
            activeRegimentIndex = 0;
            
            // Sync tracker Player 1 name if default
            if (trackerState && (trackerState.p1.name === "Player 1" || trackerState.p1.name === "" || trackerState.p1.name === "STORMCAST ETERNALS")) {
                const upperFaction = (faction || "").toUpperCase();
                if (CORE_FACTIONS.includes(upperFaction)) {
                    trackerState.p1.name = upperFaction;
                    saveTrackerState();
                }
            }
            
            newArmyDialog.close();
            
            // Navigate to Builder Tab
            switchTab("builder");
        });
    }
}

// Generate unique ID helper
function generateUUID() {
    return 'aos-army-' + Math.random().toString(36).substr(2, 9);
}

// === TABS INVENTORY/COLLECTION MANAGER RENDERING ===
function renderCollection() {
    const container = document.getElementById("collectionAccordionContainer");
    const searchVal = document.getElementById("collectionSearch").value.toLowerCase();
    const factionFilter = document.getElementById("collectionFactionFilter").value;
    
    if (!container || !appDatabase) return;
    container.innerHTML = "";
    
    let renderedFactionsCount = 0;
    
    CORE_FACTIONS.forEach(faction => {
        if (factionFilter && faction !== factionFilter) return;
        
        const factionData = appDatabase.factions[faction];
        if (!factionData) return;
        
        // Filter Heroes & Units by search string
        const filteredHeroes = factionData.heroes.filter(h => h.name.toLowerCase().includes(searchVal));
        const filteredUnits = factionData.units.filter(u => u.name.toLowerCase().includes(searchVal));
        
        if (searchVal && filteredHeroes.length === 0 && filteredUnits.length === 0) return;
        
        renderedFactionsCount++;
        
        // Create Faction Accordion UI Card
        const accordion = document.createElement("div");
        accordion.className = "accordion-item";
        
        // Count owned models in this faction
        let factionOwnedCount = 0;
        const allFactionModels = [...factionData.heroes, ...factionData.units];
        allFactionModels.forEach(m => {
            const key = `${faction}:${m.name}`;
            if (aosCollection[key] && aosCollection[key] > 0) {
                factionOwnedCount += aosCollection[key];
            }
        });
        
        accordion.innerHTML = `
            <button class="accordion-header">
                <div class="accordion-title-container">
                    <h3>${faction}</h3>
                    <span class="accordion-badge">${factionOwnedCount} Models Owned</span>
                </div>
                <i data-lucide="chevron-down"></i>
            </button>
            <div class="accordion-content">
                <div class="category-pills-container">
                    <button class="pill-btn active" data-target="all">Show All</button>
                    <button class="pill-btn" data-target="heroes"><i data-lucide="crown"></i> Heroes Only</button>
                    <button class="pill-btn" data-target="units"><i data-lucide="shield"></i> Units Only</button>
                </div>
                <div class="collection-subcategory subcat-heroes ${filteredHeroes.length === 0 ? 'hidden' : ''}">
                    <h4 class="subcategory-title"><i data-lucide="crown" style="color: var(--color-gold);"></i> Heroes</h4>
                    <div class="models-list-grid grid-heroes"></div>
                </div>
                <div class="collection-subcategory subcat-units ${filteredUnits.length === 0 ? 'hidden' : ''}" style="margin-top: 20px;">
                    <h4 class="subcategory-title"><i data-lucide="shield" style="color: var(--color-gold);"></i> Units</h4>
                    <div class="models-list-grid grid-units"></div>
                </div>
            </div>
        `;
        
        container.appendChild(accordion);
        
        // Toggle Accordion Click
        const header = accordion.querySelector(".accordion-header");
        header.addEventListener("click", () => {
            const isOpen = accordion.classList.contains("open");
            document.querySelectorAll(".accordion-item").forEach(item => item.classList.remove("open"));
            if (!isOpen) {
                accordion.classList.add("open");
            }
        });
        
        const gridHeroes = accordion.querySelector(".grid-heroes");
        const gridUnits = accordion.querySelector(".grid-units");
        
        const renderModelCard = (model, parentGrid) => {
            const key = `${faction}:${model.name}`;
            const qty = aosCollection[key] || 0;
            const isOwned = qty > 0;
            
            const card = document.createElement("div");
            card.className = `model-inventory-card ${isOwned ? 'owned' : ''}`;
            card.innerHTML = `
                <div class="model-info-block">
                    <span style="font-weight: 600;">${model.name}</span>
                    <span style="color: var(--color-text-muted); font-size: 0.8rem; margin-top: 2px;">${model.points} pts</span>
                </div>
                <div class="inventory-controls">
                    <label class="checkbox-container">
                        <input type="checkbox" class="chk-owned" ${isOwned ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        Owned
                    </label>
                    <div class="qty-counter">
                        <button class="qty-btn btn-dec">-</button>
                        <span class="qty-display">${qty}</span>
                        <button class="qty-btn btn-inc">+</button>
                    </div>
                </div>
            `;
            
            parentGrid.appendChild(card);
            
            // Checkbox Toggle logic
            const chk = card.querySelector(".chk-owned");
            const btnDec = card.querySelector(".btn-dec");
            const btnInc = card.querySelector(".btn-inc");
            const qtyDisp = card.querySelector(".qty-display");
            
            const updateUIAndStorage = (newQty) => {
                if (newQty <= 0) {
                    delete aosCollection[key];
                    card.classList.remove("owned");
                    chk.checked = false;
                } else {
                    aosCollection[key] = newQty;
                    card.classList.add("owned");
                    chk.checked = true;
                }
                qtyDisp.textContent = newQty;
                localStorage.setItem("aos_collection", JSON.stringify(aosCollection));
                
                // Recalculate and update the accordion header badge
                let updatedCount = 0;
                allFactionModels.forEach(m => {
                    const k = `${faction}:${m.name}`;
                    if (aosCollection[k]) updatedCount += aosCollection[k];
                });
                accordion.querySelector(".accordion-badge").textContent = `${updatedCount} Models Owned`;
            };
            
            chk.addEventListener("change", () => {
                if (chk.checked) {
                    updateUIAndStorage(1);
                } else {
                    updateUIAndStorage(0);
                }
            });
            
            btnDec.addEventListener("click", () => {
                updateUIAndStorage((aosCollection[key] || 0) - 1);
            });
            
            btnInc.addEventListener("click", () => {
                updateUIAndStorage((aosCollection[key] || 0) + 1);
            });
        };
        
        filteredHeroes.forEach(h => renderModelCard({...h, type: "HERO"}, gridHeroes));
        filteredUnits.forEach(u => renderModelCard({...u, type: "UNIT"}, gridUnits));
        
        // Add Filter Pills Listeners
        const pills = accordion.querySelectorAll(".pill-btn");
        const subHeroes = accordion.querySelector(".subcat-heroes");
        const subUnits = accordion.querySelector(".subcat-units");
        
        pills.forEach(pill => {
            pill.addEventListener("click", (e) => {
                e.stopPropagation(); // Avoid triggering accordion header click
                pills.forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                
                const target = pill.getAttribute("data-target");
                if (target === "all") {
                    if (filteredHeroes.length > 0) subHeroes.classList.remove("hidden");
                    if (filteredUnits.length > 0) subUnits.classList.remove("hidden");
                } else if (target === "heroes") {
                    subHeroes.classList.remove("hidden");
                    subUnits.classList.add("hidden");
                } else if (target === "units") {
                    subHeroes.classList.add("hidden");
                    subUnits.classList.remove("hidden");
                }
            });
        });
    });
    
    if (renderedFactionsCount === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="shield-alert" class="empty-icon"></i>
                <h3>No Inventory Found</h3>
                <p>Try adjusting your search filters or faction selection above.</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

function setupCollectionListeners() {
    const search = document.getElementById("collectionSearch");
    const filter = document.getElementById("collectionFactionFilter");
    
    if (search) search.addEventListener("input", renderCollection);
    if (filter) filter.addEventListener("change", renderCollection);
}

// === TAB 3: SAVED ARMIES DASHBOARD ===
function renderSavedArmies() {
    const grid = document.getElementById("savedArmiesGrid");
    if (!grid) return;
    grid.innerHTML = "";
    
    if (aosArmies.length === 0) {
        grid.innerHTML = `
            <div class="welcome-home-card glass-card">
                <div class="welcome-crest">✨</div>
                <h2>AETERNUM: AoS 4th Edition Builder</h2>
                <p class="welcome-intro">
                    Welcome to <strong>Aeternum</strong>, a premium, offline-first companion app designed specifically for Warhammer Age of Sigmar (4th Edition). Manage your model inventory, construct regiment lists with real-time rules verification, and instantly optimize lists around your collection.
                </p>
                
                <div class="guide-steps-grid">
                    <div class="guide-step">
                        <div class="step-badge">1</div>
                        <h4>Register Your Models</h4>
                        <p>Go to the <strong>My Collection</strong> tab in the sidebar to check off which Heroes and Units you own and enter their quantities.</p>
                    </div>
                    <div class="guide-step">
                        <div class="step-badge">2</div>
                        <h4>Draft a New List</h4>
                        <p>Click <strong>Create New Army</strong> below or in the sidebar, choose your faction and set a points threshold (default 1000 pts).</p>
                    </div>
                    <div class="guide-step">
                        <div class="step-badge">3</div>
                        <h4>Auto-Optimize Regiments</h4>
                        <p>Use the <strong>Auto-Optimize</strong> button. Our knapsack engine will instantly construct legal regiments from your owned models!</p>
                    </div>
                </div>
                
                <div class="welcome-actions">
                    <button class="btn btn-outline" id="btnGoToCollection">
                        <i data-lucide="shield-check"></i> Go To My Collection
                    </button>
                    <button class="btn btn-gold" id="btnWelcomeCreateArmy">
                        <i data-lucide="plus"></i> Create New Army
                    </button>
                </div>
            </div>
        `;
        
        // Add events to welcome buttons
        document.getElementById("btnGoToCollection").addEventListener("click", () => {
            switchTab("collection");
        });
        
        document.getElementById("btnWelcomeCreateArmy").addEventListener("click", () => {
            populateFactionDropdowns();
            document.getElementById("newArmyNameInput").value = ""; // Start blank to show placeholder
            document.getElementById("newArmyFactionInput").value = "";
            document.getElementById("newArmyPointsInput").value = "1000";
            document.getElementById("newArmyDialog").showModal();
        });
        
        lucide.createIcons();
        return;
    }
    
    aosArmies.forEach(army => {
        // Calculate points sum
        let pts = 0;
        army.regiments.forEach(reg => {
            if (reg.leader) pts += reg.leader.points;
            reg.units.forEach(u => {
                pts += u.points * (u.reinforced ? 2 : 1);
            });
        });
        
        const card = document.createElement("div");
        card.className = "card army-card";
        card.innerHTML = `
            <div>
                <div class="army-card-header">
                    <div>
                        <h3>${army.name}</h3>
                        <span class="army-faction">${army.faction}</span>
                    </div>
                    <span class="badge faction-badge">${army.pointsLimit} pts</span>
                </div>
                <div class="army-card-stats">
                    <div class="army-stat-pill">
                        <span>Points Total</span>
                        <span style="color: var(--color-gold);">${pts} / ${army.pointsLimit}</span>
                    </div>
                    <div class="army-stat-pill">
                        <span>Regiments</span>
                        <span>${army.regiments.length} / 5</span>
                    </div>
                </div>
            </div>
            <div class="army-card-actions">
                <button class="btn btn-icon btn-delete" title="Delete Army"><i data-lucide="trash-2" style="color: var(--color-crimson);"></i></button>
                <button class="btn btn-gold btn-sm btn-edit"><i data-lucide="edit-3"></i> Edit</button>
            </div>
        `;
        
        grid.appendChild(card);
        
        // Delete Action
        card.querySelector(".btn-delete").addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete ${army.name}?`)) {
                aosArmies = aosArmies.filter(a => a.id !== army.id);
                localStorage.setItem("aos_armies", JSON.stringify(aosArmies));
                renderSavedArmies();
            }
        });
        
        // Edit/Load Action
        card.querySelector(".btn-edit").addEventListener("click", () => {
            activeArmy = JSON.parse(JSON.stringify(army)); // Deep copy loaded army
            activeRegimentIndex = 0;
            
            // Sync tracker Player 1 name if default
            if (trackerState && (trackerState.p1.name === "Player 1" || trackerState.p1.name === "" || trackerState.p1.name === "STORMCAST ETERNALS")) {
                const upperFaction = (army.faction || "").toUpperCase();
                if (CORE_FACTIONS.includes(upperFaction)) {
                    trackerState.p1.name = upperFaction;
                    saveTrackerState();
                }
            }
            
            // Navigate to Builder tab
            switchTab("builder");
        });
    });
    
    lucide.createIcons();
}

// Helper to calculate total points of an army draft on the fly
function getArmyCurrentPoints(army) {
    if (!army || !army.regiments) return 0;
    let currentPts = 0;
    army.regiments.forEach(reg => {
        if (reg.leader) currentPts += reg.leader.points;
        reg.units.forEach(u => {
            currentPts += u.points * (u.reinforced ? 2 : 1);
        });
    });
    return currentPts;
}

// === TAB 4: ARMY REGIMENT BUILDER INTERFACE ===
function renderBuilder() {
    const builderArmyName = document.getElementById("builderArmyName");
    const builderArmyFaction = document.getElementById("builderArmyFaction");
    const armyPointsLimit = document.getElementById("armyPointsLimit");
    const regimentsList = document.getElementById("regimentsList");
    const emptyState = document.getElementById("emptyRegimentsState");
    
    // Sync active top header bar
    const topBarArmyName = document.getElementById("topBarArmyName");
    const topBarArmyFaction = document.getElementById("topBarArmyFaction");
    const armyPointsDisplay = document.getElementById("armyPointsDisplay");
    const pointsProgressBarFill = document.getElementById("pointsProgressBarFill");
    
    const workspace = document.querySelector(".builder-workspace");
    const builderInventory = document.getElementById("builderInventory");
    const validationSidebar = document.querySelector(".validation-sidebar");
    
    if (!activeArmy) {
        if (workspace) workspace.classList.add("empty-builder");
        if (builderInventory) builderInventory.classList.add("hidden");
        if (validationSidebar) validationSidebar.classList.add("hidden");
        
        // Show empty screen or locked states
        if (builderArmyName) {
            builderArmyName.value = "No Active Army Draft";
            builderArmyName.disabled = true;
        }
        if (builderArmyFaction) {
            builderArmyFaction.value = "";
            builderArmyFaction.disabled = true;
            builderArmyFaction.classList.add("hidden");
        }
        armyPointsLimit.value = "1000";
        armyPointsLimit.disabled = true;
        
        topBarArmyName.textContent = "No Active Army";
        const btnEdit = document.getElementById("btnEditArmyName");
        if (btnEdit) btnEdit.classList.add("hidden");
        const btnSaveName = document.getElementById("btnSaveArmyName");
        if (btnSaveName) btnSaveName.classList.add("hidden");
        const inputField = document.getElementById("topBarArmyNameInput");
        if (inputField) inputField.classList.add("hidden");
        if (topBarArmyName) topBarArmyName.classList.remove("hidden");
        
        topBarArmyFaction.textContent = "None";
        topBarArmyFaction.className = "badge";
        armyPointsDisplay.innerHTML = '0 / 1000 <span style="font-size: 0.85rem; opacity: 0.85; font-weight: 500; margin-left: 8px;">(1000 pts remaining)</span>';
        pointsProgressBarFill.style.width = "0%";
        
        regimentsList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="shield-alert" class="empty-icon animate-pulse" style="color: var(--color-gold);"></i>
                <h3>Choose Your Faction</h3>
                <p>Select your faction from the dropdown menu at the top-left to initialize your list building workspace and begin adding regiments.</p>
            </div>
        `;
        const btnSave = document.getElementById("btnSaveArmy");
        if (btnSave) btnSave.disabled = true;
        const btnOptimize = document.getElementById("btnOptimizeList");
        if (btnOptimize) btnOptimize.disabled = true;
        
        updateValidationPanel();
        lucide.createIcons();
        return;
    }
    
    // Heal/sanitize any historical or malformed activeArmy structures loaded from local storage
    if (activeArmy) {
        if (!activeArmy.regiments || !Array.isArray(activeArmy.regiments)) {
            activeArmy.regiments = [{ leader: null, units: [] }];
        }
        activeArmy.regiments = activeArmy.regiments.filter(reg => reg !== null);
        activeArmy.regiments.forEach(reg => {
            if (!reg.units || !Array.isArray(reg.units)) {
                reg.units = [];
            }
        });
        if (activeRegimentIndex < 0 || activeRegimentIndex >= activeArmy.regiments.length) {
            activeRegimentIndex = 0;
        }
    }
    
    if (workspace) workspace.classList.remove("empty-builder");
    if (builderInventory) builderInventory.classList.remove("hidden");
    if (validationSidebar) validationSidebar.classList.remove("hidden");
    
    // Enable state fields
    if (builderArmyName) {
        builderArmyName.value = activeArmy.name;
        builderArmyName.disabled = false;
    }
    if (builderArmyFaction) {
        builderArmyFaction.value = activeArmy.faction;
        builderArmyFaction.disabled = false;
        builderArmyFaction.classList.remove("hidden");
    }
    armyPointsLimit.value = activeArmy.pointsLimit;
    armyPointsLimit.disabled = false;
    
    topBarArmyName.textContent = activeArmy.name;
    topBarArmyFaction.textContent = activeArmy.faction;
    topBarArmyFaction.className = "badge faction-badge";
    
    // Manage top-bar inline name edit button states
    const btnEdit = document.getElementById("btnEditArmyName");
    const inputField = document.getElementById("topBarArmyNameInput");
    if (btnEdit && inputField && inputField.classList.contains("hidden")) {
        btnEdit.classList.remove("hidden");
    }
    const btnSave = document.getElementById("btnSaveArmy");
    if (btnSave) btnSave.disabled = false;
    const btnOptimize = document.getElementById("btnOptimizeList");
    if (btnOptimize) btnOptimize.disabled = false;
    
    // Calculate and render points totals
    const currentPts = getArmyCurrentPoints(activeArmy);
    const remainingPts = activeArmy.pointsLimit - currentPts;
    
    armyPointsDisplay.innerHTML = `${currentPts} / ${activeArmy.pointsLimit} <span style="font-size: 0.85rem; opacity: 0.85; font-weight: 500; margin-left: 8px;">(${remainingPts >= 0 ? `${remainingPts} pts remaining` : `${Math.abs(remainingPts)} pts over limit`})</span>`;
    const pct = Math.min(100, (currentPts / activeArmy.pointsLimit) * 100);
    pointsProgressBarFill.style.width = `${pct}%`;
    
    // Update color states based on points total
    pointsProgressBarFill.className = "points-fill";
    if (currentPts > activeArmy.pointsLimit) {
        pointsProgressBarFill.classList.add("overlimit");
    } else if (currentPts === activeArmy.pointsLimit) {
        pointsProgressBarFill.classList.add("success");
    } else if (currentPts >= activeArmy.pointsLimit - 50) {
        pointsProgressBarFill.classList.add("warning");
    }
    
    // Auto-save active changes silently to localStorage
    saveActiveArmyQuietly();
    
    // Render Regiments cards
    regimentsList.innerHTML = "";
    
    if (activeArmy.regiments.length === 0) {
        regimentsList.innerHTML = `
            <div class="empty-state" id="emptyRegimentsState">
                <i data-lucide="shield-alert" class="empty-icon"></i>
                <h3>No Regiments Added</h3>
                <p>Begin building your army by adding a Regiment led by a Hero.</p>
                <button class="btn btn-gold btn-sm" id="btnAddRegimentInitial">
                    <i data-lucide="plus"></i> Add Regiment
                </button>
            </div>
        `;
        const btnAdd = document.getElementById("btnAddRegimentInitial");
        if (btnAdd) {
            btnAdd.addEventListener("click", () => {
                activeArmy.regiments.push({ leader: null, units: [] });
                activeRegimentIndex = 0;
                renderBuilder();
            });
        }
    } else {
        // 1. Create horizontal tab bar for regiments
        const tabsContainer = document.createElement("div");
        tabsContainer.className = "regiments-tabs-bar scroller";
        
        activeArmy.regiments.forEach((reg, regIndex) => {
            const isGeneralReg = (regIndex === 0);
            
            // Calculate regiment points
            let regPts = 0;
            if (reg.leader) regPts += reg.leader.points;
            reg.units.forEach(u => {
                regPts += u.points * (u.reinforced ? 2 : 1);
            });
            
            const tab = document.createElement("button");
            tab.className = `regiment-tab-btn ${regIndex === activeRegimentIndex ? 'active' : ''}`;
            tab.innerHTML = `
                <span class="tab-label">${isGeneralReg ? 'Gen. Regiment' : `Regiment #${regIndex + 1}`}</span>
                <span class="tab-pts-badge">${regPts} pts</span>
            `;
            tab.addEventListener("click", () => {
                activeRegimentIndex = regIndex;
                renderBuilder();
            });
            tabsContainer.appendChild(tab);
        });
        
        // Add Add Regiment Tab if army has < 5 regiments
        if (activeArmy.regiments.length < 5) {
            const addTab = document.createElement("button");
            addTab.className = "regiment-tab-btn add-tab";
            addTab.innerHTML = `
                <i data-lucide="plus"></i> Add Regiment (${activeArmy.regiments.length}/5)
            `;
            addTab.addEventListener("click", () => {
                activeArmy.regiments.push({ leader: null, units: [] });
                activeRegimentIndex = activeArmy.regiments.length - 1;
                renderBuilder();
            });
            tabsContainer.appendChild(addTab);
        }
        
        regimentsList.appendChild(tabsContainer);
        
        // 2. Render only the card for the active regiment
        const reg = activeArmy.regiments[activeRegimentIndex];
        const regIndex = activeRegimentIndex;
        const isGeneralReg = (regIndex === 0);
        
        const card = document.createElement("div");
        card.className = "regiment-card active";
        
        // Calculate regiment points
        let regPts = 0;
        if (reg.leader) regPts += reg.leader.points;
        reg.units.forEach(u => {
            regPts += u.points * (u.reinforced ? 2 : 1);
        });
        
        let html = `
            <div class="regiment-header">
                <div class="regiment-header-info">
                    <span class="badge">${isGeneralReg ? 'General\'s Regiment' : `Regiment #${regIndex + 1}`}</span>
                    <h3>${reg.leader ? reg.leader.name : 'Empty Leader Slot'}</h3>
                </div>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span class="regiment-pts-counter">${regPts} pts</span>
                    <button class="btn-icon btn-remove-reg" data-index="${regIndex}" title="Remove Regiment"><i data-lucide="x-circle" style="color: var(--color-crimson);"></i></button>
                </div>
            </div>
        `;
        
        // Render Hero Leader section
        if (!reg.leader) {
            html += `
                <div class="regiment-leader empty">
                    <button class="btn btn-gold btn-sm btn-select-leader" data-index="${regIndex}">
                        <i data-lucide="plus"></i> Choose Hero Leader
                    </button>
                </div>
            `;
        } else {
            html += `
                <div class="regiment-leader">
                    <div class="hero-profile">
                        <div class="hero-avatar">✹</div>
                        <div class="hero-details">
                            <span class="hero-name">${reg.leader.name}</span>
                            <span class="hero-options">Regiment Options: <i>${formatRegimentOptions(reg.leader.options_or_keywords)}</i></span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="hero-points">${reg.leader.points} pts</span>
                        <button class="btn-icon btn-remove-leader" data-index="${regIndex}" title="Remove Regiment Leader">
                            <i data-lucide="trash-2" style="color: var(--color-crimson);"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Render Regiment Units rows
        html += `<div class="regiment-units">`;
        
        if (reg.leader) {
            reg.units.forEach((unit, unitIndex) => {
                const isHeroUnit = isJoiningHero(unit);
                const iconName = isHeroUnit ? "crown" : "shield";
                const iconStyle = isHeroUnit ? "style='color: var(--color-gold); filter: drop-shadow(0 0 2px rgba(212, 175, 55, 0.4));'" : "";
                
                html += `
                    <div class="regiment-unit-row">
                        <div class="unit-info">
                            <div class="unit-avatar" ${iconStyle}><i data-lucide="${iconName}"></i></div>
                            <div class="unit-details">
                                <span class="unit-name">${unit.name}</span>
                                <span class="unit-meta">Size: ${unit.unit_size * (unit.reinforced ? 2 : 1)} • Keywords: ${unit.options_or_keywords || 'None'}</span>
                            </div>
                        </div>
                        <div class="unit-points">
                            <button class="btn-reinforced ${unit.reinforced ? 'active' : ''}" data-reg="${regIndex}" data-unit="${unitIndex}">
                                ${unit.reinforced ? 'Reinforced (2x)' : 'Reinforce'}
                            </button>
                            <span class="unit-pts-display">${unit.points * (unit.reinforced ? 2 : 1)} pts</span>
                            <button class="btn-icon btn-remove-unit" data-reg="${regIndex}" data-unit="${unitIndex}" title="Remove unit">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            // Show Add Unit button if regiment is not full
            const maxUnits = isGeneralReg ? 4 : 3;
            if (reg.units.length < maxUnits) {
                html += `
                    <div class="add-unit-placeholder">
                        <button class="btn btn-outline btn-sm btn-select-unit" data-index="${regIndex}">
                            <i data-lucide="plus"></i> Add Unit to Regiment
                        </button>
                    </div>
                `;
            }
        }
        
        html += `</div>`; // Close regiment-units
        
        card.innerHTML = html;
        regimentsList.appendChild(card);
    }
    
    setupActiveBuilderInteractions();
    updateValidationPanel();
    renderSmartRecommendations();
    renderBuilderInventory();
    lucide.createIcons();
}

// Render owned faction models in the middle column of the builder tab
function renderBuilderInventory() {
    const container = document.getElementById("builderInventory");
    if (!container || !appDatabase || !activeArmy) return;
    
    const currentPts = getArmyCurrentPoints(activeArmy);
    const remainingPts = activeArmy.pointsLimit - currentPts;
    
    container.innerHTML = "";
    
    const faction = activeArmy.faction;
    const factionData = appDatabase.factions[faction];
    if (!factionData) {
        container.innerHTML = `<div class="empty-state"><p>Faction data not found.</p></div>`;
        return;
    }
    
    // Get all owned heroes & units for this faction
    const ownedHeroes = factionData.heroes.filter(h => {
        const key = `${faction}:${h.name}`;
        return (aosCollection[key] && aosCollection[key] > 0);
    });
    
    const ownedUnits = [
        ...factionData.units.filter(u => {
            const key = `${faction}:${u.name}`;
            return (aosCollection[key] && aosCollection[key] > 0);
        }),
        ...factionData.heroes.filter(h => {
            const key = `${faction}:${h.name}`;
            return (aosCollection[key] && aosCollection[key] > 0) && isJoiningHero(h);
        })
    ];
    
    // Detailed list composition logging
    console.groupCollapsed(`[renderBuilderInventory Debug] Compiling collection list for Faction: "${faction}"`);
    console.log("  Owned Heroes (from database.heroes):", ownedHeroes.map(h => h.name));
    console.log("  Owned Units & Joining Heroes combined:", ownedUnits.map(u => u.name));
    const terminosObj = factionData.heroes.find(h => h.name.toLowerCase().includes("terminos"));
    if (terminosObj) {
        const key = `${faction}:${terminosObj.name}`;
        console.log(`  Lord-Terminos status:`, {
            name: terminosObj.name,
            ownedCount: aosCollection[key] || 0,
            isJoiningHero: isJoiningHero(terminosObj),
            rawNotes: terminosObj.notes
        });
    } else {
        console.warn("  Lord-Terminos was not found anywhere in active faction's heroes data!");
    }
    console.groupEnd();
    
    // Setup Header
    const header = document.createElement("div");
    header.className = "builder-inventory-header";
    header.innerHTML = `
        <h3><i data-lucide="package" class="gold-icon"></i> My ${faction} Collection</h3>
        <p>Click a Hero to assign as leader. Click a compatible Unit to add to your active regiment.</p>
    `;
    container.appendChild(header);
    
    // Setup scroller
    const scroller = document.createElement("div");
    scroller.className = "inventory-scroller scroller";
    
    if (ownedHeroes.length === 0 && ownedUnits.length === 0) {
        scroller.innerHTML = `
            <div class="empty-state" style="padding: 20px 0;">
                <p>You have no owned models marked for <strong>${faction}</strong> in your inventory.</p>
                <button class="btn btn-gold btn-sm" style="margin-top: 12px;" onclick="switchTab('collection')">
                    Go to My Collection
                </button>
            </div>
        `;
        container.appendChild(scroller);
        lucide.createIcons();
        return;
    }
    
    const activeReg = activeArmy.regiments[activeRegimentIndex];
    
    // 1. Render Heroes Section
    if (ownedHeroes.length > 0) {
        const sect = document.createElement("div");
        sect.className = "inventory-section";
        sect.innerHTML = `<div class="inventory-section-title">Heroes 👑 (Leader Slot)</div>`;
        
        ownedHeroes.forEach(hero => {
            const key = `${faction}:${hero.name}`;
            const qty = aosCollection[key];
            
            const card = document.createElement("div");
            
            // Hero card is clickable if active regiment has no leader AND the hero points are affordable
            const canSelect = activeReg && !activeReg.leader;
            const isAffordable = hero.points <= remainingPts;
            
            // Check if this hero is eligible to join as a regiment member (unit) instead of leader
            const isCompAsUnit = activeReg && activeReg.leader && isJoiningHero(hero) && isUnitCompatible(activeReg.leader, hero, activeReg.units);
            const hasSpace = activeReg && (activeReg.units.length < (activeRegimentIndex === 0 ? 4 : 3));
            
            const canJoinAsUnit = isCompAsUnit && hasSpace && isAffordable;
            
            // Clickable either as a leader OR as a joining companion unit!
            const canClick = (canSelect && isAffordable) || canJoinAsUnit;
            card.className = `inventory-item-card ${canClick ? 'clickable' : 'disabled'}`;
            
            let joinAsUnitNoticeHtml = "";
            if (canJoinAsUnit) {
                joinAsUnitNoticeHtml = `
                    <div style="font-size: 0.72rem; color: var(--color-gold); margin-top: 5px; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                        <span style="display: inline-block; width: 6px; height: 6px; background-color: var(--color-gold); border-radius: 50%; box-shadow: 0 0 4px var(--color-gold);"></span>
                        👉 Click to add as Regiment Member
                    </div>
                `;
            } else if (isCompAsUnit && !hasSpace) {
                joinAsUnitNoticeHtml = `
                    <div style="font-size: 0.72rem; color: var(--color-crimson); margin-top: 5px; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                        <span style="display: inline-block; width: 6px; height: 6px; background-color: var(--color-crimson); border-radius: 50%;"></span>
                        Regiment is full (${activeRegimentIndex === 0 ? 4 : 3} units max)
                    </div>
                `;
            }
            
            let ptsHtml = `<span class="inventory-item-pts">${hero.points} pts</span>`;
            if (canSelect && !isAffordable) {
                ptsHtml = `<span class="inventory-item-pts" style="color: var(--color-crimson); text-decoration: line-through;">${hero.points} pts</span>`;
            }
            
            card.innerHTML = `
                <div class="inventory-item-info">
                    <span class="inventory-item-name">${hero.name}</span>
                    <span class="inventory-item-qty">Owned: ${qty} • Options: <i>${formatRegimentOptions(hero.options_or_keywords)}</i></span>
                    ${joinAsUnitNoticeHtml}
                </div>
                ${ptsHtml}
            `;
            
            if (canClick) {
                card.addEventListener("click", () => {
                    if (canSelect) {
                        // Assign as Leader
                        activeReg.leader = {
                            name: hero.name,
                            points: hero.points,
                            options_or_keywords: hero.options_or_keywords || ""
                        };
                    } else if (canJoinAsUnit) {
                        // Add as Companion Regiment Member
                        activeReg.units.push({
                            name: hero.name,
                            unit_size: hero.unit_size || 1,
                            points: hero.points,
                            options_or_keywords: hero.options_or_keywords || "",
                            reinforced: false
                        });
                    }
                    renderBuilder();
                });
            } else {
                if (!activeReg) {
                    card.title = "Create or select a regiment first.";
                } else if (activeReg.leader) {
                    if (isCompAsUnit && !hasSpace) {
                        card.title = `This regiment is full (${activeRegimentIndex === 0 ? 4 : 3} units max). Remove a unit or choose another regiment first.`;
                    } else if (isCompAsUnit && !isAffordable) {
                        card.title = "Not enough points remaining in the army limit!";
                    } else {
                        card.title = "Active regiment already has a Leader. Click on/add another regiment or remove the current leader first.";
                    }
                } else if (!isAffordable) {
                    card.title = "Not enough points remaining in the army limit!";
                    card.style.opacity = "0.4";
                    card.style.cursor = "not-allowed";
                }
            }
            
            sect.appendChild(card);
        });
        scroller.appendChild(sect);
    }
    
    // 2. Render Units Section
    if (ownedUnits.length > 0) {
        const sect = document.createElement("div");
        sect.className = "inventory-section";
        sect.innerHTML = `<div class="inventory-section-title">Units 🛡️ (Regiment Members)</div>`;
        
        ownedUnits.forEach(unit => {
            const key = `${faction}:${unit.name}`;
            const qty = aosCollection[key];
            
            const card = document.createElement("div");
            
            // Unit is clickable if active regiment has a leader AND unit is compatible with the leader AND is affordable
            const hasLeader = activeReg && activeReg.leader;
            const isComp = hasLeader && isUnitCompatible(activeReg.leader, unit, activeReg.units);
            const hasSpace = activeReg && (activeReg.units.length < (activeRegimentIndex === 0 ? 4 : 3)); // General's reg: 4 units max, others: 3
            const isAffordable = unit.points <= remainingPts;
            const canAdd = isComp && hasSpace && isAffordable;
            
            // Console log the specific evaluation details for Lord-Terminos in the sidebar
            if (unit.name.toLowerCase().includes("terminos")) {
                console.log(`[Sidebar Card Evaluation] "${unit.name}" values: hasLeader=${hasLeader}, isComp=${isComp}, hasSpace=${hasSpace}, isAffordable=${isAffordable}, canAdd=${canAdd}, points=${unit.points}, remainingPts=${remainingPts}`);
            }
            
            card.className = `inventory-item-card ${canAdd ? 'clickable' : 'disabled'}`;
            
            let ptsHtml = `<span class="inventory-item-pts">${unit.points} pts</span>`;
            if (isComp && hasSpace && !isAffordable) {
                ptsHtml = `<span class="inventory-item-pts" style="color: var(--color-crimson); text-decoration: line-through;">${unit.points} pts</span>`;
            }
            
            card.innerHTML = `
                <div class="inventory-item-info">
                    <span class="inventory-item-name">${unit.name}</span>
                    <span class="inventory-item-qty">Owned: ${qty} • Size: ${unit.unit_size} • Keywords: <i>${unit.options_or_keywords || 'None'}</i></span>
                </div>
                ${ptsHtml}
            `;
            
            if (canAdd) {
                card.addEventListener("click", () => {
                    activeReg.units.push({
                        name: unit.name,
                        unit_size: unit.unit_size,
                        points: unit.points,
                        options_or_keywords: unit.options_or_keywords || "",
                        reinforced: false
                    });
                    renderBuilder();
                });
            } else {
                if (!hasLeader) {
                    card.title = "Choose a Hero leader for this regiment first.";
                } else if (!isComp) {
                    card.title = `Incompatible with ${activeReg.leader.name}'s regiment options: ${formatRegimentOptions(activeReg.leader.options_or_keywords)}`;
                } else if (!hasSpace) {
                    card.title = `This regiment is full (${activeRegimentIndex === 0 ? 4 : 3} units max). Choose/create another regiment.`;
                } else if (!isAffordable) {
                    card.title = "Not enough points remaining in the army limit!";
                    card.style.opacity = "0.4";
                    card.style.cursor = "not-allowed";
                }
            }
            
            sect.appendChild(card);
        });
        scroller.appendChild(sect);
    }
    
    container.appendChild(scroller);
    lucide.createIcons();
}

// Attach event listeners to builder nodes
function setupActiveBuilderInteractions() {
    // Regiment remove
    document.querySelectorAll(".btn-remove-reg").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const index = parseInt(btn.getAttribute("data-index"));
            activeArmy.regiments.splice(index, 1);
            if (activeRegimentIndex >= activeArmy.regiments.length) {
                activeRegimentIndex = Math.max(0, activeArmy.regiments.length - 1);
            }
            renderBuilder();
        });
    });
    
    // Remove leader
    document.querySelectorAll(".btn-remove-leader").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const index = parseInt(btn.getAttribute("data-index"));
            activeArmy.regiments[index].leader = null;
            activeArmy.regiments[index].units = []; // Clear units since regiment cannot exist without leader
            renderBuilder();
        });
    });
    
    // Choose Hero leader
    document.querySelectorAll(".btn-select-leader").forEach(btn => {
        btn.addEventListener("click", () => {
            activeRegimentIndexForDrawer = parseInt(btn.getAttribute("data-index"));
            activeDrawerType = "hero";
            openSelectionDrawer();
        });
    });
    
    // Choose Unit to add
    document.querySelectorAll(".btn-select-unit").forEach(btn => {
        btn.addEventListener("click", () => {
            activeRegimentIndexForDrawer = parseInt(btn.getAttribute("data-index"));
            activeDrawerType = "unit";
            openSelectionDrawer();
        });
    });
    
    // Remove unit
    document.querySelectorAll(".btn-remove-unit").forEach(btn => {
        btn.addEventListener("click", () => {
            const regIdx = parseInt(btn.getAttribute("data-reg"));
            const unitIdx = parseInt(btn.getAttribute("data-unit"));
            activeArmy.regiments[regIdx].units.splice(unitIdx, 1);
            renderBuilder();
        });
    });
    
    // Toggle Reinforce unit
    document.querySelectorAll(".btn-reinforced").forEach(btn => {
        btn.addEventListener("click", () => {
            const regIdx = parseInt(btn.getAttribute("data-reg"));
            const unitIdx = parseInt(btn.getAttribute("data-unit"));
            const unit = activeArmy.regiments[regIdx].units[unitIdx];
            unit.reinforced = !unit.reinforced;
            renderBuilder();
        });
    });
}

// Open Selection Drawer with slide animation
function openSelectionDrawer() {
    const drawer = document.getElementById("selectionDrawer");
    const drawerTitle = document.getElementById("drawerTitle");
    const drawerSearch = document.getElementById("drawerSearch");
    
    drawerTitle.textContent = activeDrawerType === "hero" ? "Select Regiment Leader" : "Select Regiment Unit";
    drawerSearch.value = "";
    document.getElementById("drawerOwnedOnly").checked = false;
    
    renderDrawerItems();
    drawer.showModal();
}

// Render available options inside Selection Drawer modal
function renderDrawerItems() {
    const list = document.getElementById("drawerItemsList");
    const searchVal = document.getElementById("drawerSearch").value.toLowerCase();
    const ownedOnly = document.getElementById("drawerOwnedOnly").checked;
    
    if (!list || !appDatabase || !activeArmy) return;
    list.innerHTML = "";
    
    const currentPts = getArmyCurrentPoints(activeArmy);
    const remainingPts = activeArmy.pointsLimit - currentPts;
    
    const factionData = appDatabase.factions[activeArmy.faction];
    if (!factionData) return;
    
    let itemsToSelect = [];
    const activeReg = activeArmy.regiments[activeRegimentIndexForDrawer];
    
    if (activeDrawerType === "hero") {
        itemsToSelect = factionData.heroes;
    } else {
        // Retrieve regiment rules constraints from the leader
        const leader = activeReg.leader;
        
        // Combine regular units and eligible joining-heroes (excluding the leader themselves)
        const joiningHeroes = (factionData.heroes || []).filter(h => 
            h.name !== leader.name && isJoiningHero(h)
        );
        
        const candidateModels = [
            ...factionData.units,
            ...joiningHeroes
        ];
        
        // Filter units by compatibility with Leader Options
        itemsToSelect = candidateModels.filter(unit => isUnitCompatible(leader, unit, activeReg.units));
    }
    
    // Filter by search string and ownership
    let filteredItems = itemsToSelect.filter(item => item.name.toLowerCase().includes(searchVal));
    if (ownedOnly) {
        filteredItems = filteredItems.filter(item => {
            const key = `${activeArmy.faction}:${item.name}`;
            return (aosCollection[key] && aosCollection[key] > 0);
        });
    }
    
    if (filteredItems.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>No compatible models found in your database ${ownedOnly ? 'or owned inventory' : ''}.</p>
            </div>
        `;
        return;
    }
    
    filteredItems.forEach(item => {
        const key = `${activeArmy.faction}:${item.name}`;
        const ownedQty = aosCollection[key] || 0;
        
        // Calculate affordability
        let isAffordable = true;
        if (activeDrawerType === "hero") {
            const oldLeaderPoints = activeReg.leader ? activeReg.leader.points : 0;
            isAffordable = (item.points - oldLeaderPoints) <= remainingPts;
        } else {
            isAffordable = item.points <= remainingPts;
        }
        
        if (item.name.toLowerCase().includes("terminos")) {
            console.log(`[Selection Drawer Card Evaluation] "${item.name}" values: activeDrawerType=${activeDrawerType}, isAffordable=${isAffordable}, points=${item.points}, remainingPts=${remainingPts}`);
        }
        
        const card = document.createElement("div");
        card.className = `selection-list-card ${isAffordable ? '' : 'disabled'}`;
        
        let ptsHtml = `<span class="sel-pts">${item.points} pts</span>`;
        if (!isAffordable) {
            ptsHtml = `<span class="sel-pts" style="color: var(--color-crimson); text-decoration: line-through;">${item.points} pts</span>`;
        }
        
        card.innerHTML = `
            <div class="sel-info">
                <span class="sel-name">${item.name}</span>
                <span class="sel-meta">${activeDrawerType === 'hero' ? 'Hero' : 'Unit'} • Size: ${item.unit_size} • ${ownedQty > 0 ? `Owned: ${ownedQty}` : '<span style="color: var(--color-crimson);">Unowned</span>'}</span>
                <span class="sel-keywords" style="display: block; font-size: 0.75rem; color: var(--color-text-dark); margin-top: 4px;">${activeDrawerType === 'hero' ? 'Regiment Options' : 'Keywords'}: <i>${activeDrawerType === 'hero' ? formatRegimentOptions(item.options_or_keywords) : (item.options_or_keywords || 'None')}</i></span>
            </div>
            ${ptsHtml}
        `;
        
        if (isAffordable) {
            card.addEventListener("click", () => {
                const reg = activeArmy.regiments[activeRegimentIndexForDrawer];
                
                if (activeDrawerType === "hero") {
                    reg.leader = {
                        name: item.name,
                        points: item.points,
                        options_or_keywords: item.options_or_keywords || ""
                    };
                } else {
                    reg.units.push({
                        name: item.name,
                        unit_size: item.unit_size,
                        points: item.points,
                        options_or_keywords: item.options_or_keywords || "",
                        reinforced: false
                    });
                }
                
                document.getElementById("selectionDrawer").close();
                renderBuilder();
            });
        } else {
            card.style.cursor = "not-allowed";
            card.style.opacity = "0.4";
            card.title = "Not enough points remaining in the army limit!";
        }
        
        list.appendChild(card);
    });
}

// ==========================================
// --- RULES ENFORCEMENT & ELIGIBILITY VERIFICATION ---
// ==========================================

// Resilient Canonical Keyword Dictionary for AoS 4th Edition
const VALID_AOS_KEYWORDS = [
    "Sylvaneth",
    "Warrior Chamber",
    "Warriors of Chaos",
    "Vanari",
    "Vanguard Chamber",
    "Gravelords",
    "War Machine",
    "Knights",
    "Bossrokk",
    "Ruination Chamber",
    "Idoneth Deepkin",
    "Kharadron Overlords",
    "Fyreslayers",
    "Flesh-eater Courts",
    "Ossiarch Bonereapers",
    "Daughters of Khaine",
    "Lumineth Realm-lords",
    "Seraphon",
    "Blades of Khorne",
    "Disciples of Tzeentch",
    "Hedonites of Slaanesh",
    "Maggotkin of Nurgle",
    "Gloomspite Gitz",
    "Orruk Warclans",
    "Stormcast Eternals",
    "Cities of Sigmar",
    "Soulblight Gravelords"
];

// Compile resilient spacing-resilient regexes for on-the-fly spacing reconstruction
const COMPILED_KEYWORD_DICTIONARY = VALID_AOS_KEYWORDS.map(keyword => {
    const escapedChars = [...keyword].map((char, index) => {
        const escaped = char.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        if (char === ' ') return '\\s+';
        if (index === keyword.length - 1) return escaped;
        return escaped + '\\s*';
    });
    return {
        regex: new RegExp('\\b' + escapedChars.join('') + '\\b', 'gi'),
        canonical: keyword
    };
});

// Dynamic space-split keyword restorer
function cleanSpacedKeywords(str) {
    if (!str) return "";
    let cleaned = str;
    for (const { regex, canonical } of COMPILED_KEYWORD_DICTIONARY) {
        cleaned = cleaned.replace(regex, canonical);
    }
    return cleaned;
}

// Format/clean leader options for display
function formatRegimentOptions(options) {
    if (!options) return "None";
    let cleaned = cleanSpacedKeywords(options);
    return cleaned
        .replace(/\d+\s*(?:×|x)\s*\d+\s*mm/gi, "")
        .replace(/\d+\s*mm/gi, "")
        .replace(/\s*[✹•*]\s*/g, ", ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
}

// Check if a hero is eligible to join another hero's regiment as a companion
function isJoiningHero(hero) {
    if (!hero) return false;
    
    // 1. Check notes if available
    if (hero.notes) {
        const normNotes = hero.notes.toLowerCase().replace(/[\xa0\s]+/g, " ");
        if (normNotes.includes("this hero can join") || 
            normNotes.includes("trugg’s") || 
            normNotes.includes("be’lakor") || 
            normNotes.includes("lord kroak") ||
            normNotes.includes("slann starmaster") ||
            normNotes.includes("joins") ||
            normNotes.includes("join eligible regiment") ||
            normNotes.includes("join an eligible regiment")) {
            return true;
        }
    }
    
    // 2. Fallback check by name (covers all AoS 4e sub-heroes/companions even if rules/notes are missing/empty in cached storage)
    if (getCompanionRoleByName(hero.name)) {
        return true;
    }
    
    // Special named leader fallbacks
    const nameLower = hero.name.toLowerCase();
    const specialJoiningNames = [
        "dexcessa", "synessa", "mollog", "first prince"
    ];
    return specialJoiningNames.some(kw => nameLower.includes(kw));
}

function getCompanionRoleByName(name) {
    if (!name) return null;
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes("terminos") || nameLower.includes("imperatant") || nameLower.includes("questor") || nameLower.includes("vexillor") || nameLower.includes("azyros") || nameLower.includes("judicator") || nameLower.includes("steel soul")) {
        return "stormcast exemplar";
    }
    if (nameLower.includes("zandtos") || nameLower.includes("kavalos") || nameLower.includes("mortek")) {
        return "legion subcommander";
    }
    if (nameLower.includes("volga") || nameLower.includes("rat prince") || nameLower.includes("annika") || nameLower.includes("gorslav") || nameLower.includes("torgillius") || nameLower.includes("halgrim")) {
        return "vyrkos retainer";
    }
    if (nameLower.includes("wight king") || nameLower.includes("wight lord")) {
        return "deathrattle overseer";
    }
    if (nameLower.includes("loonboss") || nameLower.includes("rabble-rowza") || nameLower.includes("squigboss")) {
        return "moonclan agitator";
    }
    if (nameLower.includes("snarlboss")) {
        return "top dog";
    }
    if (nameLower.includes("ardboy big boss") || nameLower.includes("megaboss") || nameLower.includes("anvilsmasha")) {
        return "headstompa";
    }
    if (nameLower.includes("tuskboss")) {
        return "tusk wrangler";
    }
    if (nameLower.includes("mirebrute") || nameLower.includes("corpse-rippa") || nameLower.includes("great gnashtoof") || nameLower.includes("sludgeraker")) {
        return "swamp beast";
    }
    if (nameLower.includes("slittaboss") || nameLower.includes("stab-grot") || nameLower.includes("belcha-banna")) {
        return "mob wrangler";
    }
    if (nameLower.includes("huskard") || nameLower.includes("icebrow hunter") || nameLower.includes("mantrapper")) {
        return "voice of the everwinter";
    }
    if (nameLower.includes("mega-gargant")) {
        return "eager lout";
    }
    if (nameLower.includes("arch-revenant")) {
        return "forest sentinel";
    }
    if (nameLower.includes("bloodsecrator") || nameLower.includes("bloodstoker") || nameLower.includes("deathbringer") || nameLower.includes("skullgrinder")) {
        return "bloodbound warmonger";
    }
    if (nameLower.includes("skulltaker")) {
        return "slaughter seeker";
    }
    if (nameLower.includes("bloodthirster")) {
        return "baleful lord";
    }
    if (nameLower.includes("herald of tzeentch") || nameLower.includes("changeling")) {
        return "tzeentchian deceiver";
    }
    if (nameLower.includes("curseling") || nameLower.includes("fatemaster") || nameLower.includes("magister") || nameLower.includes("thaumaturge")) {
        return "arcanite cabalist";
    }
    if (nameLower.includes("enrapturess") || nameLower.includes("masque") || nameLower.includes("viceleader")) {
        return "slaaneshi beguiler";
    }
    if (nameLower.includes("lord of hubris") || nameLower.includes("lord of hysteria") || nameLower.includes("lord of pain") || nameLower.includes("sigvald")) {
        return "dark egotist";
    }
    if (nameLower.includes("war despot")) {
        return "hashutite commander";
    }
    if (nameLower.includes("cankerborn") || nameLower.includes("poxbringer") || nameLower.includes("spoilpox")) {
        return "plague scion";
    }
    if (nameLower.includes("lord of blights") || nameLower.includes("lord of plagues")) {
        return "rotbringer lord";
    }
    if (nameLower.includes("clawlord") || nameLower.includes("deathmaster") || nameLower.includes("master moulder") || nameLower.includes("bombardier") || nameLower.includes("galvaneer") || nameLower.includes("warlock engineer")) {
        return "skaven overclaw";
    }
    if (nameLower.includes("centaurion") || nameLower.includes("chaos lord") || nameLower.includes("daemonic mount") || nameLower.includes("exalted hero") || nameLower.includes("myrmidon")) {
        return "ruinous champion";
    }
    if (nameLower.includes("chieftain") || nameLower.includes("warsteed")) {
        return "oathsworn";
    }
    if (nameLower.includes("courtier") || nameLower.includes("gormayne") || nameLower.includes("felgryn") || nameLower.includes("marrowscroll") || nameLower.includes("decapitator")) {
        return "royal attendant";
    }
    if (nameLower.includes("cairn wraith") || nameLower.includes("tomb banshee") || nameLower.includes("executioner") || nameLower.includes("vitriolic") || nameLower.includes("scriptor mortis") || nameLower.includes("spirit torment")) {
        return "cursed soul";
    }
    return null;
}

// Enforce AoS Keyword and regiment compatibility Rules in JS
function isUnitCompatible(hero, unit, activeRegimentUnits = []) {
    if (!hero || !hero.options_or_keywords) return true;

    // Detect if we are testing Lord Terminos for targeted console logging
    const isTerminosCheck = (unit && unit.name && unit.name.toLowerCase().includes("terminos")) || 
                            (hero && hero.name && hero.name.toLowerCase().includes("terminos"));
    
    if (isTerminosCheck) {
        console.group(`[isUnitCompatible Debug] Checking compatibility of "${unit.name}" inside "${hero.name}"'s regiment`);
        console.log("  Leader Options or Keywords:", hero.options_or_keywords);
        console.log("  Unit Options or Keywords:", unit.options_or_keywords);
        console.log("  Unit Notes:", unit.notes);
    }
    
    // Normalize unicode non-breaking hyphens, dashes, and extra spaces to standard equivalents
    const clean = (str) => {
        if (!str) return "";
        let cleaned = cleanSpacedKeywords(str);
        return cleaned.toLowerCase()
            .replace(/[\u2011\u2012\u2013\u2014]/g, "-")
            .replace(/gryph\s*-\s*stalker/g, "gryphstalker")
            .replace(/\s+/g, " ")
            .trim();
    };
    
    // Clean up base sizes, dimensions (e.g., 60 × 35mm) and convert divider symbols like ✹ to commas
    const sanitizeOptions = (str) => {
        if (!str) return "";
        return str
            .replace(/\d+\s*(?:×|x)\s*\d+\s*mm/gi, "")
            .replace(/\d+\s*mm/gi, "")
            .replace(/[✹*•]/g, ",")
            .replace(/\s+/g, " ")
            .trim();
    };
    
    const optionsText = clean(sanitizeOptions(hero.options_or_keywords));
    if (isTerminosCheck) {
        console.log("  Sanitized Leader Options String:", optionsText);
    }

    const factionRaw = activeArmy ? activeArmy.faction : (hero.faction || "");
    const factionName = clean(factionRaw).toUpperCase();
    
    // 1. Broad Faction Matching
    // If the hero options text includes "any [faction]", they can take any unit from that faction!
    if (factionName && optionsText.includes("any " + factionName.toLowerCase())) {
        if (isTerminosCheck) {
            console.log("  [PASS] Matches broad faction allowance (any " + factionName.toLowerCase() + ")");
            console.groupEnd();
        }
        return true;
    }
    
    // 2. Race-to-Faction Fallback (supports "Any Aelf", "Any Duardin", etc. rules in AoS 4e)
    const subfactionMap = {
        "aelf": ["DAUGHTERS OF KHAINE", "LUMINETH REALM-LORDS", "IDONETH DEEPKIN", "SYLVANETH", "CITIES OF SIGMAR"],
        "duardin": ["FYRESLAYERS", "KHARADRON OVERLORDS", "CITIES OF SIGMAR"],
        "orruk": ["ORRUK WARCLANS"],
        "ogor": ["ORRUK WARCLANS", "CITIES OF SIGMAR"],
        "gloomspite": ["GLOOMSPITE GITZ"],
        "skaven": ["SKAVEN"],
        "nurgle": ["MAGGOTKIN OF NURGLE"],
        "khorne": ["BLADES OF KHORNE"],
        "tzeentch": ["DISCIPLES OF TZEENTCH"],
        "slaanesh": ["HEDONITES OF SLAANESH"],
        "seraphon": ["SERAPHON"],
        "stormcast": ["STORMCAST ETERNALS"],
        "undead": ["FLESH-EATER COURTS", "NIGHTHAUNT", "OSSIARCH BONEREAPERS", "SOULBLIGHT GRAVELORDS"],
        "death": ["FLESH-EATER COURTS", "NIGHTHAUNT", "OSSIARCH BONEREAPERS", "SOULBLIGHT GRAVELORDS"]
    };
    
    for (const [race, factions] of Object.entries(subfactionMap)) {
        const hasRace = optionsText.includes("any " + race) && !optionsText.includes("non-" + race);
        if (hasRace && factions.includes(factionName)) {
            if (isTerminosCheck) {
                console.log("  [PASS] Matches race allowance (any " + race + ") for faction " + factionName);
                console.groupEnd();
            }
            return true;
        }
    }
    
    // 3. Keyword Enrichment for specific units (restores missing fields in simplified offline database)
    const unitName = clean(unit.name);
    const enrichedKeywords = new Set(clean(unit.options_or_keywords).split(",").map(k => k.trim()));
    if (isTerminosCheck) {
        console.log("  Initial Enriched Keywords from unit.options_or_keywords:", Array.from(enrichedKeywords));
    }
    
    if (factionName === "DAUGHTERS OF KHAINE") {
        // Do not globally add "aelf" to Daughters of Khaine, as Melusai/Medusa (Sisters/Stalkers) do not have the AELF keyword
        if (unitName.includes("sister") || unitName.includes("stalker") || unitName.includes("melusai") || unitName.includes("ironscale")) {
            enrichedKeywords.add("melusai");
        }
        if (unitName.includes("khinerai") || unitName.includes("lifetaker") || unitName.includes("heartrender")) {
            enrichedKeywords.add("khinerai");
        }
        if (unitName.includes("witch") || unitName.includes("slaughter")) {
            enrichedKeywords.add("witch aelf");
        }
    }
    
    if (factionName === "STORMCAST ETERNALS") {
        enrichedKeywords.add("stormcast");
        if (unitName.includes("liberator") || unitName.includes("sequitor") || unitName.includes("vanquisher") || unitName.includes("vindictor")) {
            enrichedKeywords.add("redeemer");
        }
    }
    
    // Dynamic sub-hero Companion/Exemplar role and leader extraction from Notes
    let foundCompanionRole = null;
    let notesCleaned = "";
    
    if (unit.notes) {
        notesCleaned = cleanSpacedKeywords(unit.notes)
            .replace(/[\xa0\s]+/g, " ")
            .trim();
        const notesLower = notesCleaned.toLowerCase();
        if (isTerminosCheck) {
            console.log("  Normalized Notes:", notesLower);
        }
        
        // Treat notes as keywords: Add complete clauses/sentences as keywords
        const clauses = notesLower.split(/[.,;]/);
        for (const c of clauses) {
            const trimmed = c.trim();
            if (trimmed) {
                enrichedKeywords.add(trimmed);
            }
        }
        
        // Treat notes as keywords: Split notes into individual words and add them as keywords (ignoring short utility words)
        const words = notesLower.split(/[\s,.:;!?'"’`()\[\]{}]+/).filter(w => w.length > 2);
        for (const w of words) {
            enrichedKeywords.add(w);
        }
        
        if (notesLower.includes("this hero can join") || notesLower.includes("trugg’s") || notesLower.includes("be’lakor") || notesLower.includes("lord kroak") || notesLower.includes("slann starmaster") || notesLower.includes("join")) {
            // Match companion roles: "as a/an [Role]"
            const roleMatch = notesCleaned.match(/as (?:a|an) ([^.]+)/i);
            if (roleMatch) {
                foundCompanionRole = clean(roleMatch[1].trim());
                if (isTerminosCheck) {
                    console.log("  Extracted Companion Role from notes regex matching:", foundCompanionRole);
                }
            }
            
            // Match specific leaders: "join [Leader]'s regiment"
            const leaderMatch = notesCleaned.match(/join ([^'’]+)(?:'|’|'s|’s)\s*regiment/i);
            if (leaderMatch) {
                const leaderNameWord = leaderMatch[1].trim().toLowerCase();
                if (isTerminosCheck) {
                    console.log("  Extracted specific leader constraint word:", leaderNameWord);
                }
                if (clean(hero.name).includes(leaderNameWord)) {
                    enrichedKeywords.add(optionsText); // automatic match
                    if (isTerminosCheck) {
                        console.log("  [PASS] Auto-matched specific leader name in notes: " + leaderNameWord);
                    }
                }
            }
            
            // Match explicit special exceptions
            if (notesLower.includes("be’lakor") && clean(hero.name).includes("belakor")) {
                enrichedKeywords.add(optionsText);
            }
            if (notesLower.includes("lord kroak") && clean(hero.name).includes("kroak")) {
                enrichedKeywords.add(optionsText);
            }
            if (notesLower.includes("slann starmaster") && clean(hero.name).includes("slann")) {
                enrichedKeywords.add(optionsText);
            }
            if (notesLower.includes("trugg") && clean(hero.name).includes("trugg")) {
                enrichedKeywords.add(optionsText);
            }
        }
    }
    
    // Fallback: If no companion role was extracted from notes, use name-based companion role resolving (immune to empty notes in local storage)
    if (!foundCompanionRole) {
        foundCompanionRole = getCompanionRoleByName(unit.name);
        if (isTerminosCheck) {
            console.log("  Name-based companion role resolution fallback:", foundCompanionRole);
        }
    }
    
    if (foundCompanionRole) {
        enrichedKeywords.add(clean(foundCompanionRole));
    }
    
    // Name-based specific leader matching fallback
    const unitNameLower = unitName.toLowerCase();
    const heroNameLower = clean(hero.name).toLowerCase();
    if (unitNameLower.includes("dexcessa") && heroNameLower.includes("synessa")) {
        enrichedKeywords.add(optionsText);
    }
    if (unitNameLower.includes("synessa") && heroNameLower.includes("dexcessa")) {
        enrichedKeywords.add(optionsText);
    }
    if (unitNameLower.includes("mollog") && heroNameLower.includes("trugg")) {
        enrichedKeywords.add(optionsText);
    }
    if (unitNameLower.includes("big boss") && heroNameLower.includes("wurrgog")) {
        enrichedKeywords.add(optionsText);
    }
    if (unitNameLower.includes("bloodpelt") && heroNameLower.includes("tyrant")) {
        enrichedKeywords.add(optionsText);
    }
    if (unitNameLower.includes("first prince") && heroNameLower.includes("belakor")) {
        enrichedKeywords.add(optionsText);
    }
    
    if (isTerminosCheck) {
        console.log("  Final Enriched Keywords Set:", Array.from(enrichedKeywords));
    }

    // 4. Split and verify requirements
    const requirements = optionsText.split(",").map(r => r.trim());
    if (isTerminosCheck) {
        console.log("  Testing leader options requirements array:", requirements);
    }
    
    for (const req of requirements) {
        // Handle negative keywords (e.g. "non-aelf" or "non-hero")
        if (req.includes("non-")) {
            const forbiddenKeyword = req.replace(/^(0-\d+|any)\s+/, "").replace("non-", "").trim().toLowerCase();
            const hasForbidden = unitName.includes(forbiddenKeyword) || Array.from(enrichedKeywords).some(k => k.includes(forbiddenKeyword));
            if (isTerminosCheck) {
                console.log(`    Testing negative requirement "${req}". Has forbidden "${forbiddenKeyword}"? ${hasForbidden}`);
            }
            if (!hasForbidden) {
                if (isTerminosCheck) {
                    console.log(`    [PASS] Clean of forbidden keyword "${forbiddenKeyword}"`);
                    console.groupEnd();
                }
                return true; // Unit is compatible since it does NOT have the forbidden keyword
            }
            continue; // Move to see if it matches any other comma-separated requirement
        }
        
        // Strip quantifier words
        const reqClean = req.replace(/^(0-\d+|any)\s+/, "").trim();
        const reqWords = reqClean.split(/\s+/).filter(w => w.length > 2);
        if (isTerminosCheck) {
            console.log(`    Evaluating positive requirement "${req}" with match words:`, reqWords);
        }
        
        // If all clean words exist in Unit Name or enriched Keywords
        const match = reqWords.every(word => {
            const wordLower = word.toLowerCase();
            const inName = unitName.includes(wordLower);
            const inKeywords = Array.from(enrichedKeywords).some(k => k.includes(wordLower));
            if (isTerminosCheck) {
                console.log(`      Word "${wordLower}": in name? ${inName}, in enriched keywords? ${inKeywords}`);
            }
            return inName || inKeywords;
        });
        
        if (match) {
            if (isTerminosCheck) {
                console.log(`    [MATCH] Successfully matched all words for requirement: "${req}"`);
            }
            
            // Enforce Core AoS 4th Edition Restriction:
            // A regiment cannot include MONSTER, WARMACHINE, or BEAST units unless specifically allowed by this matching requirement.
            const unitKeywordsLower = Array.from(enrichedKeywords).map(k => k.toLowerCase());
            const isMonster = unitKeywordsLower.includes("monster") || unitName.includes("monster");
            const isWarmachine = unitKeywordsLower.includes("warmachine") || unitName.includes("warmachine");
            const isBeast = unitKeywordsLower.includes("beast") || unitName.includes("beast");
            
            const reqLower = req.toLowerCase();
            if (isMonster && !reqLower.includes("monster")) {
                if (isTerminosCheck) {
                    console.log("    [SKIP] Unit is a MONSTER but requirement doesn't explicitly allow MONSTER.");
                }
                continue; // This requirement doesn't explicitly allow monsters, try next option
            }
            if (isWarmachine && !reqLower.includes("warmachine")) {
                if (isTerminosCheck) {
                    console.log("    [SKIP] Unit is a WARMACHINE but requirement doesn't explicitly allow WARMACHINE.");
                }
                continue; // This requirement doesn't explicitly allow warmachines, try next option
            }
            if (isBeast && !reqLower.includes("beast")) {
                if (isTerminosCheck) {
                    console.log("    [SKIP] Unit is a BEAST but requirement doesn't explicitly allow BEAST.");
                }
                continue; // This requirement doesn't explicitly allow beasts, try next option
            }
            
            // Enforce 0-1 restrictions inside the active regiment
            if (req.startsWith("0-1")) {
                const count = activeRegimentUnits.filter(u => u.name === unit.name).length;
                if (isTerminosCheck) {
                    console.log(`    Enforcing 0-1 restriction. Active count in regiment: ${count}`);
                }
                if (count >= 1) {
                    if (isTerminosCheck) {
                        console.log("    [FAIL] Already 1 instance of this 0-1 unit in the regiment.");
                        console.groupEnd();
                    }
                    return false;
                }
            }
            if (isTerminosCheck) {
                console.log("    [PASS] Compatibility check matches and succeeds!");
                console.groupEnd();
            }
            return true;
        }
    }
    
    if (isTerminosCheck) {
        console.log("  [FAIL] Did not match any regiment requirement options for this leader.");
        console.groupEnd();
    }
    return false;
}

// Update validation checks panel dynamically
function updateValidationPanel() {
    const list = document.getElementById("validationList");
    if (!list) return;
    list.innerHTML = "";
    
    if (!activeArmy) {
        list.innerHTML = `<div class="validation-item error"><span>No draft army loaded.</span></div>`;
        return;
    }
    
    const errors = [];
    let currentPts = 0;
    
    // 1. Point limit validation
    activeArmy.regiments.forEach(reg => {
        if (reg.leader) currentPts += reg.leader.points;
        reg.units.forEach(u => {
            currentPts += u.points * (u.reinforced ? 2 : 1);
        });
    });
    
    if (currentPts > activeArmy.pointsLimit) {
        errors.push(`Points exceed limit: ${currentPts} / ${activeArmy.pointsLimit} pts.`);
    }
    
    // 2. Regiment leader presence
    activeArmy.regiments.forEach((reg, i) => {
        if (!reg.leader) {
            errors.push(`Regiment #${i + 1} has no Hero Leader.`);
        }
    });
    
    // 3. Size and keyword check
    activeArmy.regiments.forEach((reg, regIdx) => {
        if (!reg.leader) return;
        reg.units.forEach(unit => {
            if (!isUnitCompatible(reg.leader, unit, reg.units.filter(u => u.name !== unit.name))) {
                errors.push(`"${unit.name}" is incompatible with ${reg.leader.name}'s rules.`);
            }
        });
    });
    
    if (errors.length === 0) {
        list.innerHTML = `
            <div class="validation-item success">
                <i data-lucide="check-circle-2"></i>
                <span>Army list is valid! Ready for battle.</span>
            </div>
        `;
    } else {
        errors.forEach(err => {
            list.innerHTML += `
                <div class="validation-item error">
                    <i data-lucide="alert-triangle"></i>
                    <span>${err}</span>
                </div>
            `;
        });
    }
    
    lucide.createIcons();
}

// === SMART UNOWNED RECOMMENDATIONS ===
function renderSmartRecommendations() {
    const list = document.getElementById("recommendationsList");
    if (!list || !activeArmy || !appDatabase) return;
    list.innerHTML = "";
    
    // Calculate current points and free slots
    let currentPts = 0;
    activeArmy.regiments.forEach(reg => {
        if (reg.leader) currentPts += reg.leader.points;
        reg.units.forEach(u => {
            currentPts += u.points * (u.reinforced ? 2 : 1);
        });
    });
    
    const leftoverPts = activeArmy.pointsLimit - currentPts;
    if (leftoverPts <= 0) {
        list.innerHTML = `<p class="recommendation-desc">Point limit reached. Excellent job!</p>`;
        return;
    }
    
    const factionData = appDatabase.factions[activeArmy.faction];
    if (!factionData) return;
    
    // Find unowned units of this faction that cost <= leftoverPts
    const unownedCompatibleUnits = [];
    
    factionData.units.forEach(unit => {
        const key = `${activeArmy.faction}:${unit.name}`;
        const isOwned = aosCollection[key] && aosCollection[key] > 0;
        
        if (!isOwned && unit.points <= leftoverPts) {
            // Find if there's any active regiment with an open slot and compatibility
            activeArmy.regiments.forEach((reg, regIndex) => {
                const isGeneral = (regIndex === 0);
                const maxUnits = isGeneral ? 4 : 3;
                
                if (reg.leader && reg.units.length < maxUnits && isUnitCompatible(reg.leader, unit, reg.units)) {
                    unownedCompatibleUnits.push({
                        unit: unit,
                        regIndex: regIndex
                    });
                }
            });
        }
    });
    
    // Sort recommendations by points descending to get the best fitting unit first
    unownedCompatibleUnits.sort((a, b) => b.unit.points - a.unit.points);
    
    // Keep top 3 recommendations
    const topRecommendations = unownedCompatibleUnits.slice(0, 3);
    
    if (topRecommendations.length === 0) {
        list.innerHTML = `<p class="recommendation-desc">No compatible unowned units fit within your remaining ${leftoverPts} pts.</p>`;
        return;
    }
    
    topRecommendations.forEach(reco => {
        const card = document.createElement("div");
        card.className = "reco-card";
        card.innerHTML = `
            <div class="reco-info">
                <span class="reco-name">${reco.unit.name}</span>
                <span class="reco-pts">${reco.unit.points} pts • Join Reg #${reco.regIndex + 1}</span>
            </div>
            <button class="reco-add-btn" data-reg="${reco.regIndex}" data-unit-name="${reco.unit.name}" title="Buy and add to regiment">
                <i data-lucide="plus"></i>
            </button>
        `;
        
        card.querySelector(".reco-add-btn").addEventListener("click", () => {
            const reg = activeArmy.regiments[reco.regIndex];
            
            // Logically "purchase" it: Mark as owned in collection so builder accepts it
            const key = `${activeArmy.faction}:${reco.unit.name}`;
            aosCollection[key] = (aosCollection[key] || 0) + 1;
            localStorage.setItem("aos_collection", JSON.stringify(aosCollection));
            
            // Add to army
            reg.units.push({
                name: reco.unit.name,
                unit_size: reco.unit.unit_size,
                points: reco.unit.points,
                options_or_keywords: reco.unit.options_or_keywords || "",
                reinforced: false
            });
            
            renderBuilder();
        });
        
        list.appendChild(card);
    });
    
    lucide.createIcons();
}

// Silently auto-saves active army state to localStorage
function saveActiveArmyQuietly() {
    if (!activeArmy) return;
    const existingIndex = aosArmies.findIndex(a => a.id === activeArmy.id);
    if (existingIndex !== -1) {
        aosArmies[existingIndex] = JSON.parse(JSON.stringify(activeArmy));
    } else {
        aosArmies.push(JSON.parse(JSON.stringify(activeArmy)));
    }
    localStorage.setItem("aos_armies", JSON.stringify(aosArmies));
    renderSavedArmies(); // Keep dashboard cards updated!
}

// Setup top action listeners on builder panel
function setupBuilderListeners() {
    const search = document.getElementById("drawerSearch");
    const ownedToggle = document.getElementById("drawerOwnedOnly");
    
    if (search) search.addEventListener("input", renderDrawerItems);
    if (ownedToggle) ownedToggle.addEventListener("change", renderDrawerItems);
    
    // Close Drawer panel click
    const btnCloseDrawer = document.getElementById("btnCloseDrawer");
    if (btnCloseDrawer) {
        btnCloseDrawer.addEventListener("click", () => {
            document.getElementById("selectionDrawer").close();
        });
    }
    
    // Inline top bar army name editor listeners
    const topBarArmyName = document.getElementById("topBarArmyName");
    const topBarArmyNameInput = document.getElementById("topBarArmyNameInput");
    const btnEditArmyName = document.getElementById("btnEditArmyName");
    const btnSaveArmyName = document.getElementById("btnSaveArmyName");
    
    function startEditingName() {
        if (!activeArmy) return;
        topBarArmyName.classList.add("hidden");
        btnEditArmyName.classList.add("hidden");
        topBarArmyNameInput.classList.remove("hidden");
        btnSaveArmyName.classList.remove("hidden");
        
        topBarArmyNameInput.value = activeArmy.name;
        topBarArmyNameInput.focus();
        topBarArmyNameInput.select();
    }
    
    function commitEditedName() {
        if (!activeArmy) return;
        const newName = topBarArmyNameInput.value.trim();
        if (newName) {
            activeArmy.name = newName;
            topBarArmyName.textContent = newName;
            saveActiveArmyQuietly(); // Instantly save and update dashboard!
        }
        
        topBarArmyNameInput.classList.add("hidden");
        btnSaveArmyName.classList.add("hidden");
        topBarArmyName.classList.remove("hidden");
        btnEditArmyName.classList.remove("hidden");
    }
    
    function cancelEditingName() {
        topBarArmyNameInput.classList.add("hidden");
        btnSaveArmyName.classList.add("hidden");
        topBarArmyName.classList.remove("hidden");
        btnEditArmyName.classList.remove("hidden");
    }
    
    if (topBarArmyName && topBarArmyNameInput && btnEditArmyName && btnSaveArmyName) {
        topBarArmyName.addEventListener("click", startEditingName);
        btnEditArmyName.addEventListener("click", startEditingName);
        btnSaveArmyName.addEventListener("click", commitEditedName);
        
        topBarArmyNameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                commitEditedName();
            } else if (e.key === "Escape") {
                cancelEditingName();
            }
        });
        
        topBarArmyNameInput.addEventListener("blur", (e) => {
            // Slight timeout to let click events register if they click Save or Cancel
            setTimeout(() => {
                if (!topBarArmyNameInput.classList.contains("hidden")) {
                    commitEditedName();
                }
            }, 180);
        });
    }
    
    const limitSelector = document.getElementById("armyPointsLimit");
    if (limitSelector) {
        limitSelector.addEventListener("change", () => {
            if (activeArmy) {
                activeArmy.pointsLimit = parseInt(limitSelector.value);
                renderBuilder();
            }
        });
    }

    const factionSelector = document.getElementById("builderArmyFaction");
    if (factionSelector) {
        factionSelector.addEventListener("change", () => {
            const faction = factionSelector.value;
            if (faction) {
                if (activeArmy) {
                    if (activeArmy.faction !== faction) {
                        if (confirm(`Changing your faction to ${faction} will reset your current regiment slots. Do you want to continue?`)) {
                            activeArmy.faction = faction;
                            activeArmy.name = `My ${faction} Host`;
                            activeArmy.regiments = [{ leader: null, units: [] }];
                            activeRegimentIndex = 0;
                            renderBuilder();
                        } else {
                            // Revert dropdown back to active army faction
                            factionSelector.value = activeArmy.faction;
                        }
                    }
                } else {
                    const ptsLimit = limitSelector ? parseInt(limitSelector.value) : 1000;
                    activeArmy = {
                        id: generateUUID(),
                        name: `My ${faction} Host`,
                        faction: faction,
                        pointsLimit: ptsLimit,
                        regiments: [{ leader: null, units: [] }] // Start with 1 empty regiment to welcome them!
                    };
                    activeRegimentIndex = 0;
                    renderBuilder();
                }
            }
        });
    }
    
    // Automated auto-saving takes care of list changes automatically in the background
    
    // Initial workspace add regiment button
    const btnAddRegimentInitial = document.getElementById("btnAddRegimentInitial");
    if (btnAddRegimentInitial) {
        btnAddRegimentInitial.addEventListener("click", () => {
            if (activeArmy) {
                activeArmy.regiments.push({ leader: null, units: [] });
                activeRegimentIndex = activeArmy.regiments.length - 1;
                renderBuilder();
            } else {
                const owned = getOwnedFactions();
                if (owned.length === 1) {
                    // Auto-initialize with their single owned faction!
                    const faction = owned[0];
                    const limitSel = document.getElementById("armyPointsLimit");
                    const ptsLimit = limitSel ? parseInt(limitSel.value) : 1000;
                    activeArmy = {
                        id: generateUUID(),
                        name: `My ${faction} Host`,
                        faction: faction,
                        pointsLimit: ptsLimit,
                        regiments: [{ leader: null, units: [] }]
                    };
                    activeRegimentIndex = 0;
                    renderBuilder();
                } else {
                    const selector = document.getElementById("builderArmyFaction");
                    if (selector) {
                        selector.focus();
                        selector.style.borderColor = "var(--color-crimson)";
                        selector.style.boxShadow = "0 0 10px rgba(220, 53, 69, 0.5)";
                        setTimeout(() => {
                            selector.style.borderColor = "";
                            selector.style.boxShadow = "";
                        }, 2000);
                    }
                    alert("Please select an Army Faction from the dropdown at the top-left to initialize your list building!");
                }
            }
        });
    }
    
    // Dynamic Knapsack Army Optimizer
    const btnOptimizeList = document.getElementById("btnOptimizeList");
    if (btnOptimizeList) {
        btnOptimizeList.addEventListener("click", () => {
            if (!activeArmy) return;
            optimizeActiveArmy();
        });
    }
}

// === MAGIC COLLECTION OPTIMIZER (KNAPSACK SOLVER) ===
function optimizeActiveArmy() {
    if (!appDatabase || !activeArmy) return;
    
    const faction = activeArmy.faction;
    const pointsLimit = activeArmy.pointsLimit;
    const factionData = appDatabase.factions[faction];
    if (!factionData) return;
    
    // 1. Gather all owned heroes and units
    const ownedHeroes = factionData.heroes.filter(h => {
        const key = `${faction}:${h.name}`;
        return (aosCollection[key] && aosCollection[key] > 0);
    });
    
    const ownedUnits = [
        ...factionData.units.filter(u => {
            const key = `${faction}:${u.name}`;
            return (aosCollection[key] && aosCollection[key] > 0);
        }),
        ...factionData.heroes.filter(h => {
            const key = `${faction}:${h.name}`;
            return (aosCollection[key] && aosCollection[key] > 0) && isJoiningHero(h);
        })
    ];
    
    if (ownedHeroes.length === 0) {
        alert(`You do not own any Heroes for ${faction} in your collection! Please go to "My Collection" and toggle some Heroes first.`);
        return;
    }
    
    // Determine target number of regiments (1 Hero per regiment)
    // 500pts: 1, 1000pts: 2, 1500pts: 3, 2000pts: 4-5
    let maxRegimentsCount = 3;
    if (pointsLimit <= 500) maxRegimentsCount = 1;
    else if (pointsLimit <= 1000) maxRegimentsCount = 2;
    else if (pointsLimit >= 2000) maxRegimentsCount = 4;
    
    // Select the best owned heroes (prioritizing higher point leaders or unique models up to maxRegimentsCount)
    // Sort owned heroes by points descending
    const sortedHeroes = [...ownedHeroes].sort((a, b) => b.points - a.points);
    const selectedLeaders = sortedHeroes.slice(0, maxRegimentsCount);
    
    // Initialize temporary regiments state
    const regiments = selectedLeaders.map((hero, idx) => ({
        leader: {
            name: hero.name,
            points: hero.points,
            options_or_keywords: hero.options_or_keywords || ""
        },
        units: []
    }));
    
    // Keep a local copy of owned units pool quantities
    const unitsInventory = {};
    ownedUnits.forEach(u => {
        const key = `${faction}:${u.name}`;
        unitsInventory[u.name] = {
            model: u,
            qtyLeft: aosCollection[key] || 0
        };
    });
    
    // Helper to calculate total pts in active regiments
    const getListPtsSum = () => {
        let pts = 0;
        regiments.forEach(reg => {
            pts += reg.leader.points;
            reg.units.forEach(u => {
                pts += u.points * (u.reinforced ? 2 : 1);
            });
        });
        return pts;
    };
    
    // Greedy Knapsack filling algorithm:
    // We repeatedly find the highest point compatible owned unit that can fit into any regiment
    let addedAny = true;
    while (addedAny) {
        addedAny = false;
        
        let bestCandidate = null;
        let bestTargetRegIndex = null;
        let bestPointsFit = -1;
        
        const currentTotal = getListPtsSum();
        const ptsLeft = pointsLimit - currentTotal;
        
        if (ptsLeft <= 0) break;
        
        // Scan all regiments to see which compatible units can fit
        regiments.forEach((reg, regIndex) => {
            const isGeneral = (regIndex === 0);
            const maxSlots = isGeneral ? 4 : 3;
            
            // Check if regiment slots are open
            if (reg.units.length >= maxSlots) return;
            
            // Scan all owned units
            for (const unitName in unitsInventory) {
                const inv = unitsInventory[unitName];
                if (inv.qtyLeft <= 0) continue;
                
                const unit = inv.model;
                
                // Fits under points limit?
                if (unit.points <= ptsLeft) {
                    // Compatible with leader rules?
                    if (isUnitCompatible(reg.leader, unit, reg.units)) {
                        // We want to prioritize units that use up points optimally
                        if (unit.points > bestPointsFit) {
                            bestCandidate = unit;
                            bestTargetRegIndex = regIndex;
                            bestPointsFit = unit.points;
                        }
                    }
                }
            }
        });
        
        // If we found a candidate unit, add it
        if (bestCandidate) {
            regiments[bestTargetRegIndex].units.push({
                name: bestCandidate.name,
                unit_size: bestCandidate.unit_size,
                points: bestCandidate.points,
                options_or_keywords: bestCandidate.options_or_keywords || "",
                reinforced: false
            });
            
            // Decrement inventory qty
            unitsInventory[bestCandidate.name].qtyLeft--;
            addedAny = true;
        }
    }
    
    // Try to reinforce units to consume final leftover points
    let reinforcedAny = true;
    while (reinforcedAny) {
        reinforcedAny = false;
        
        const currentTotal = getListPtsSum();
        const ptsLeft = pointsLimit - currentTotal;
        if (ptsLeft <= 0) break;
        
        // Find a unit that is not reinforced, can fit under remaining points, and whose inventory has another copy
        for (let regIdx = 0; regIdx < regiments.length; regIdx++) {
            const reg = regiments[regIdx];
            for (let unitIdx = 0; unitIdx < reg.units.length; unitIdx++) {
                const unit = reg.units[unitIdx];
                if (!unit.reinforced && unit.points <= ptsLeft) {
                    // Check inventory if we have another copy
                    const inv = unitsInventory[unit.name];
                    if (inv && inv.qtyLeft > 0) {
                        unit.reinforced = true;
                        inv.qtyLeft--;
                        reinforcedAny = true;
                        break;
                    }
                }
            }
            if (reinforcedAny) break;
        }
    }
    
    // Load optimized structure into activeArmy
    activeArmy.regiments = regiments;
    renderBuilder();
    alert(`List optimized! Constructed ${regiments.length} valid regiments totaling ${getListPtsSum()} / ${pointsLimit} points using your owned models.`);
}

// === TAB 4: CLIENT-SIDE PDF PARSER & COMPARISON DIFFERENCE ENGINE ===
function setupPdfDropZone() {
    const zone = document.getElementById("pdfDropZone");
    const input = document.getElementById("pdfFileInput");
    
    if (!zone || !input) return;
    
    zone.addEventListener("click", () => input.click());
    
    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.style.borderColor = "var(--color-gold)";
        zone.style.backgroundColor = "var(--color-gold-glow)";
    });
    
    zone.addEventListener("dragleave", () => {
        zone.style.borderColor = "var(--border-gold)";
        zone.style.backgroundColor = "rgba(212, 175, 55, 0.01)";
    });
    
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.style.borderColor = "var(--border-gold)";
        zone.style.backgroundColor = "rgba(212, 175, 55, 0.01)";
        
        if (e.dataTransfer.files.length > 0) {
            handlePdfFile(e.dataTransfer.files[0]);
        }
    });
    
    input.addEventListener("change", () => {
        if (input.files.length > 0) {
            handlePdfFile(input.files[0]);
        }
    });
    
    // Dismiss Diff Checker cancel button
    const btnCancelDiff = document.getElementById("btnCancelDiff");
    if (btnCancelDiff) {
        btnCancelDiff.addEventListener("click", () => {
            document.getElementById("diffViewer").classList.add("hidden");
            document.getElementById("pdfDropZone").classList.remove("hidden");
        });
    }
}

// Process and parse PDF contents fully in Javascript
async function handlePdfFile(file) {
    if (file.type !== "application/pdf") {
        alert("Please upload a valid PDF document.");
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = async function() {
            const arrayBuffer = this.result;
            
            const dropIcon = document.querySelector(".drop-icon");
            dropIcon.style.animation = "goldGlowPulse 1.5s infinite ease-in-out";
            document.querySelector("#pdfDropZone p").textContent = "Extracting rules and tokenizing PDF text...";
            
            // 1. Get raw text page-by-page from PDF.js
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const parsedPages = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join("\n");
                parsedPages.push(text);
            }
            
            // 2. Feed text into Javascript state machine equivalent of our Python parser!
            const newDatabase = parsePdfTextStateEngine(parsedPages);
            
            // Stop loading pulse
            dropIcon.style.animation = "";
            document.querySelector("#pdfDropZone p").textContent = "or click to upload from file manager";
            
            // 3. Perform dynamic database diff and render
            runDatabaseDiffChecker(newDatabase);
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error("PDF Parsing failed:", err);
        alert(`Error tokenizing PDF text: ${err.message}`);
    }
}

// Javascript equivalent of our Python robust state machine parser
function parsePdfTextStateEngine(pages) {
    const database = {
        factions: {},
        regiments_of_renown: [],
        manifestations: [],
        legends: {}
    };
    
    let currentFaction = null;
    let currentSection = null; // null, "LEGENDS", "RENOWN", "MANIFESTATION"
    let currentType = null;    // "HEROES", "UNITS", "AUXILIARY"
    let activeEntry = null;
    let pendingName = "";
    
    // Commit active entry
    const saveActiveEntry = () => {
        if (!activeEntry) return;
        
        const text = activeEntry.raw_lines.join(" ").trim();
        
        // Extract base size (regex for standard mm strings at end of line)
        const baseSizeRegex = /(?:(\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)(?:,\s*\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)*\s*(?:\s*or\s*(?:\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)(?:,\s*\d+(?:\s*×\s*\d+)?\s*mm(?:\s*\[\d+\])?)*)*)$/i;
        const baseMatch = text.match(baseSizeRegex);
        
        let baseSize = "Unknown";
        let restText = text;
        if (baseMatch) {
            baseSize = baseMatch[0].trim();
            restText = text.substring(0, baseMatch.index).trim();
        }
        
        activeEntry.base_size = baseSize;
        
        // Separate options/keywords vs notes using standard marker rules
        let notesStart = -1;
        const markers = ["This unit", "This Hero", "You can include", "You cannot", "Must be", "Previously", "This Regiment", "Can join", "Only taken in", "This unit cannot be reinforced"];
        for (const marker of markers) {
            const idx = restText.indexOf(marker);
            if (idx !== -1 && (notesStart === -1 || idx < notesStart)) {
                notesStart = idx;
            }
        }
        
        if (notesStart !== -1) {
            activeEntry.options_or_keywords = restText.substring(0, notesStart).trim();
            activeEntry.notes = restText.substring(notesStart).trim();
        } else {
            activeEntry.options_or_keywords = restText;
            activeEntry.notes = "";
        }
        
        // Clean trailing commas from keywords
        activeEntry.options_or_keywords = activeEntry.options_or_keywords.replace(/,\s*$/, "").trim();
        
        // Push to structure
        if (currentSection === "RENOWN") {
            database.regiments_of_renown.push(activeEntry);
        } else if (currentSection === "MANIFESTATION") {
            database.manifestations.push(activeEntry);
        } else if (currentSection === "LEGENDS") {
            const legendFaction = currentFaction || "OTHER";
            if (!database.legends[legendFaction]) {
                database.legends[legendFaction] = { heroes: [], units: [] };
            }
            if (currentType === "HEROES") {
                database.legends[legendFaction].heroes.push(activeEntry);
            } else {
                database.legends[legendFaction].units.push(activeEntry);
            }
        } else {
            if (currentFaction) {
                if (!database.factions[currentFaction]) {
                    database.factions[currentFaction] = { heroes: [], units: [], auxiliary: [] };
                }
                if (currentType === "HEROES") {
                    database.factions[currentFaction].heroes.push(activeEntry);
                } else if (currentType === "UNITS") {
                    database.factions[currentFaction].units.push(activeEntry);
                } else {
                    database.factions[currentFaction].auxiliary.push(activeEntry);
                }
            }
        }
        
        activeEntry = null;
    };
    
    // Core Row regex matcher
    const entryRegex = /^([a-zA-Z✹\s•\.\-\u2011\u00ad\’\’\,\&\’\:\/\(\)]+)\s+(\d+)\s+([0-9\-\+]+(?:\s*\([0-9\-\+]+\))?)\s*(.*)$/;
    
    // Start parsing page by page (offset page index 2 is PDF page 3)
    for (let pageIdx = 2; pageIdx < pages.length; pageIdx++) {
        const text = pages[pageIdx];
        const lines = text.split("\n").map(l => l.strip ? l.strip() : l.trim()).filter(l => l.length > 0);
        
        let i = 0;
        const numLines = lines.length;
        
        while (i < numLines) {
            const line = lines[i];
            if (line === "®" || line === "BATTLE PROFILES" || line.includes("JUNE 2026") || line.includes("JUNE 20")) {
                i++;
                continue;
            }
            
            const lineUpper = line.toUpperCase();
            
            // 1. Detect section transitions
            const isLegendsHeader = lineUpper.includes("WARHAMMER LEGENDS") && !lineUpper.includes("MOVE TO") && !lineUpper.includes("ON");
            const isRenownHeader = lineUpper.includes("REGIMENTS OF RENOWN") && !lineUpper.includes("CAN BE INCLUDED") && !lineUpper.includes("THIS REGIMENT");
            const isManifestationHeader = lineUpper.includes("UNIVERSAL MANIFESTATION LORES");
            
            if (isLegendsHeader && lineUpper.length < 40) {
                saveActiveEntry();
                currentSection = "LEGENDS";
                currentFaction = null;
                currentType = null;
                pendingName = "";
                i++;
                continue;
            } else if (isRenownHeader && lineUpper.length < 40) {
                saveActiveEntry();
                currentSection = "RENOWN";
                currentFaction = null;
                currentType = "UNITS";
                pendingName = "";
                i++;
                continue;
            } else if (isManifestationHeader && lineUpper.length < 45) {
                saveActiveEntry();
                currentSection = "MANIFESTATION";
                currentFaction = null;
                currentType = "AUXILIARY";
                pendingName = "";
                i++;
                continue;
            }
            
            // 2. Detect Factions (whitespace-independent matching)
            let factionDetected = false;
            const lineStripped = lineUpper.replace(/\s+/g, "");
            for (const faction of CORE_FACTIONS) {
                const factionStripped = faction.replace(/\s+/g, "");
                if (lineStripped.includes(factionStripped) && (lineStripped.startsWith(factionStripped) || lineStripped.includes("NEW") || lineStripped.includes("UPDATED"))) {
                    saveActiveEntry();
                    currentFaction = faction;
                    currentSection = null;
                    factionDetected = true;
                    pendingName = "";
                    break;
                }
            }
            
            if (factionDetected) {
                if (!database.factions[currentFaction]) {
                    database.factions[currentFaction] = { heroes: [], units: [], auxiliary: [] };
                }
                i++;
                continue;
            }
            
            // 3. Detect Table Headers
            if (lineUpper.includes("HEROES UNIT SIZE") || lineUpper.includes("LEGENDS HEROES")) {
                saveActiveEntry();
                currentType = "HEROES";
                pendingName = "";
                i++;
                continue;
            } else if (lineUpper.includes("UNITS UNIT SIZE") || lineUpper.includes("LEGENDS UNITS") || lineUpper.includes("R ELEVA NT") || lineUpper.includes("RELEVANT KEYWORDS")) {
                saveActiveEntry();
                currentType = "UNITS";
                pendingName = "";
                i++;
                continue;
            } else if (lineUpper.includes("TYPE NAME POINTS")) {
                saveActiveEntry();
                currentType = "AUXILIARY";
                pendingName = "";
                i++;
                continue;
            }
            
            // 4. Row Matching
            const match = line.match(entryRegex);
            
            // --- Lookahead Pending Name Logic ---
            if (!match && (currentType === "HEROES" || currentType === "UNITS")) {
                let isNextRowMatch = false;
                if (i + 1 < numLines) {
                    const nextLine = lines[i+1];
                    const nextLineUpper = nextLine.toUpperCase();
                    
                    const isSpecialHeader = CORE_FACTIONS.some(f => nextLineUpper.replace(/\s+/g, "").includes(f.replace(/\s+/g, ""))) ||
                                            nextLineUpper.includes("HEROES UNIT SIZE") || nextLineUpper.includes("UNITS UNIT SIZE") ||
                                            nextLineUpper.includes("R ELEVA NT") || nextLineUpper.includes("WARHAMMER LEGENDS") ||
                                            nextLineUpper.includes("REGIMENTS");
                                            
                    if (!isSpecialHeader) {
                        const nextMatch = nextLine.match(entryRegex);
                        if (nextMatch) {
                            isNextRowMatch = true;
                        }
                    }
                }
                
                const isNameFragment = /^[A-Za-z\s\u2011\u00ad\’\-\,\&\’]+$/.test(line) && !line.includes("mm") && line.length < 45;
                
                if (isNextRowMatch && isNameFragment) {
                    saveActiveEntry();
                    pendingName = line;
                    i++;
                    continue;
                }
            }
            
            if (match && (currentType === "HEROES" || currentType === "UNITS")) {
                saveActiveEntry();
                let name = match[1].trim();
                name = name.replace(/^[✹•\s]+/, "").trim();
                
                if (pendingName) {
                    name = pendingName + " " + name;
                    pendingName = "";
                }
                
                const unit_size = parseInt(match[2]);
                const pointsRaw = match[3].trim();
                const pointsMatch = pointsRaw.match(/^(\d+)/);
                const points = pointsMatch ? parseInt(pointsMatch[1]) : 0;
                
                const rest = match[4].trim();
                activeEntry = {
                    name: name,
                    unit_size: unit_size,
                    points: points,
                    points_raw: pointsRaw,
                    raw_lines: rest ? [rest] : []
                };
            } else if (activeEntry) {
                activeEntry.raw_lines.push(line);
            } else {
                // Parse auxiliary rules
                if (currentType === "AUXILIARY" && currentFaction) {
                    const auxMatch = line.match(/^(.*?)\s+(\d+)\s+(.*)$/);
                    if (auxMatch) {
                        const nameAndType = auxMatch[1].trim();
                        const points = parseInt(auxMatch[2]);
                        const notes = auxMatch[3].trim();
                        
                        if (!database.factions[currentFaction]) {
                            database.factions[currentFaction] = { heroes: [], units: [], auxiliary: [] };
                        }
                        database.factions[currentFaction].auxiliary.push({
                            name: nameAndType,
                            points: points,
                            notes: notes
                        });
                    }
                }
            }
            
            i++;
        }
    }
    
    saveActiveEntry();
    return database;
}

// Diff Engine comparing Active Preloaded vs Newly Extracted PDF database
function runDatabaseDiffChecker(newDb) {
    const list = document.getElementById("diffResultsContainer");
    if (!list) return;
    list.innerHTML = "";
    
    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    
    const diffEntries = []; // Elements of format { type: 'added'/'modified', faction, name, oldVal, newVal }
    
    // Compare standard factions
    for (const faction in appDatabase.factions) {
        const oldFaction = appDatabase.factions[faction];
        const newFaction = newDb.factions[faction];
        
        if (!newFaction) continue; // Faction completely missing in new PDF (rare)
        
        // Helper to diff lists of items
        const diffList = (oldList, newList, itemType) => {
            const oldMap = {};
            oldList.forEach(item => oldMap[item.name] = item);
            
            const newMap = {};
            newList.forEach(item => newMap[item.name] = item);
            
            // Check for additions and modifications
            newList.forEach(newItem => {
                const oldItem = oldMap[newItem.name];
                if (!oldItem) {
                    addedCount++;
                    diffEntries.push({
                        type: 'added',
                        faction: faction,
                        name: newItem.name,
                        subText: `${itemType} • Size: ${newItem.unit_size}`,
                        newVal: `${newItem.points} pts`
                    });
                } else if (oldItem.points !== newItem.points) {
                    modifiedCount++;
                    diffEntries.push({
                        type: 'modified',
                        faction: faction,
                        name: newItem.name,
                        subText: `${itemType} • Points modified`,
                        oldVal: `${oldItem.points} pts`,
                        newVal: `${newItem.points} pts`
                    });
                }
            });
            
            // Check for deletions
            oldList.forEach(oldItem => {
                if (!newMap[oldItem.name]) {
                    deletedCount++;
                    diffEntries.push({
                        type: 'deleted',
                        faction: faction,
                        name: oldItem.name,
                        subText: `${itemType} • Removed from PDF`,
                        oldVal: `${oldItem.points} pts`
                    });
                }
            });
        };
        
        diffList(oldFaction.heroes, newFaction.heroes, "Hero");
        diffList(oldFaction.units, newFaction.units, "Unit");
    }
    
    // Update badge stats
    document.getElementById("diffAddedCount").textContent = addedCount;
    document.getElementById("diffModifiedCount").textContent = modifiedCount;
    document.getElementById("diffDeletedCount").textContent = deletedCount;
    
    // Render diff visual rows
    if (diffEntries.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i data-lucide="check-circle-2" class="empty-icon" style="color: var(--color-green);"></i>
                <h3>No Differences Detected</h3>
                <p>Your local rules database is completely up-to-date with the uploaded document!</p>
            </div>
        `;
    } else {
        diffEntries.forEach(entry => {
            const card = document.createElement("div");
            card.className = `diff-item ${entry.type}`;
            
            let valHtml = "";
            if (entry.type === "added") {
                valHtml = `<span class="diff-val-new">${entry.newVal}</span>`;
            } else if (entry.type === "modified") {
                valHtml = `<span class="diff-val-old">${entry.oldVal}</span> <i data-lucide="chevrons-right" style="width: 14px;"></i> <span class="diff-val-new">${entry.newVal}</span>`;
            } else if (entry.type === "deleted") {
                valHtml = `<span class="diff-val-old">${entry.oldVal}</span>`;
            }
            
            card.innerHTML = `
                <div class="diff-item-meta">
                    <span>${entry.name}</span>
                    <span>${entry.faction} • ${entry.subText}</span>
                </div>
                <div class="diff-item-values">
                    ${valHtml}
                </div>
            `;
            
            list.appendChild(card);
        });
    }
    
    // Toggle active panels
    document.getElementById("pdfDropZone").classList.add("hidden");
    const diffViewer = document.getElementById("diffViewer");
    diffViewer.classList.remove("hidden");
    
    // Wire up Apply button to update appDatabase, local storage and PostgreSQL backend!
    const btnApplyDiff = document.getElementById("btnApplyDiff");
    btnApplyDiff.onclick = async () => {
        appDatabase = newDb;
        localStorage.setItem("aos_custom_database", JSON.stringify(newDb));
        
        try {
            console.log("Updating database on PostgreSQL backend...");
            const response = await fetch('/api/database', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newDb)
            });
            if (response.ok) {
                console.log("PostgreSQL database successfully updated.");
            } else {
                console.error("Failed to update PostgreSQL database:", response.statusText);
            }
        } catch (err) {
            console.warn("PostgreSQL backend update failed. Applied changes locally only:", err);
        }
        
        alert("Rules database successfully updated! Reloading rules...");
        
        // Hide viewer and trigger reload
        diffViewer.classList.add("hidden");
        document.getElementById("pdfDropZone").classList.remove("hidden");
        
        populateFactionDropdowns();
        renderSavedArmies();
        
        // Redraw current tabs
        renderCollection();
    };
    
    lucide.createIcons();
}

// ==========================================================================
// GAME TRACKER LOGIC
// ==========================================================================

let trackerState = {
    round: 1,
    activePlayer: "p1",
    phase: "start",
    attacker: "p1",
    underdog: "",
    roundHistory: { 1: "p1", 2: "", 3: "", 4: "", 5: "" },
    p1: {
        name: "STORMCAST ETERNALS",
        cp: 4,
        scores: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        tactics: { 1: "", 2: "", 3: "", 4: "", 5: "" },
        completed: { 1: false, 2: false, 3: false, 4: false, 5: false }
    },
    p2: {
        name: "SKAVEN",
        cp: 4,
        scores: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        tactics: { 1: "", 2: "", 3: "", 4: "", 5: "" },
        completed: { 1: false, 2: false, 3: false, 4: false, 5: false }
    }
};

const BATTLE_TACTICS = [
    { id: "flanks", name: "Take the Flanks" },
    { id: "centre", name: "Seize the Centre" },
    { id: "entourage", name: "Slay the Entourage" },
    { id: "territory", name: "Take the Territory" },
    { id: "eye", name: "An Eye for an Eye" },
    { id: "land", name: "Reclaim the Land" }
];

// Load tracker state from localStorage
function loadTrackerState() {
    const saved = localStorage.getItem("aos_game_tracker_state");
    if (saved) {
        try {
            trackerState = JSON.parse(saved);
            // Backward compatibility checks
            if (trackerState.attacker === undefined) {
                trackerState.attacker = "p1";
            }
            if (trackerState.underdog === undefined) {
                trackerState.underdog = "";
            }
            if (trackerState.hideHeader === undefined) {
                trackerState.hideHeader = false;
            }
            if (trackerState.roundHistory === undefined) {
                trackerState.roundHistory = { 1: "p1", 2: "", 3: "", 4: "", 5: "" };
            }
            if (!trackerState.p1.tactics) {
                trackerState.p1.tactics = { 1: "", 2: "", 3: "", 4: "", 5: "" };
            }
            if (!trackerState.p2.tactics) {
                trackerState.p2.tactics = { 1: "", 2: "", 3: "", 4: "", 5: "" };
            }
            if (!trackerState.p1.completed) {
                trackerState.p1.completed = { 1: false, 2: false, 3: false, 4: false, 5: false };
            }
            if (!trackerState.p2.completed) {
                trackerState.p2.completed = { 1: false, 2: false, 3: false, 4: false, 5: false };
            }
        } catch (e) {
            console.error("Failed to parse game tracker state", e);
        }
    } else {
        resetTrackerState(false);
    }
}

// Save tracker state to localStorage
function saveTrackerState() {
    localStorage.setItem("aos_game_tracker_state", JSON.stringify(trackerState));
}

// Reset Game Tracker state
function resetTrackerState(shouldSave = true) {
    trackerState = {
        round: 1,
        activePlayer: "p1",
        phase: "start",
        attacker: "p1",
        underdog: "",
        hideHeader: false,
        roundHistory: { 1: "p1", 2: "", 3: "", 4: "", 5: "" },
        p1: {
            name: (activeArmy && activeArmy.faction && CORE_FACTIONS.includes(activeArmy.faction.toUpperCase())) ? activeArmy.faction.toUpperCase() : "STORMCAST ETERNALS",
            cp: 4,
            scores: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            tactics: { 1: "", 2: "", 3: "", 4: "", 5: "" },
            completed: { 1: false, 2: false, 3: false, 4: false, 5: false }
        },
        p2: {
            name: "SKAVEN",
            cp: 4,
            scores: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            tactics: { 1: "", 2: "", 3: "", 4: "", 5: "" },
            completed: { 1: false, 2: false, 3: false, 4: false, 5: false }
        }
    };
    if (shouldSave) saveTrackerState();
}

// Populate dropdown list with unused battle tactics for specific player & round
function populateTacticSelectForRound(selectEl, playerKey, roundNum) {
    const playerState = trackerState[playerKey];
    
    // Identify used tactics in other rounds to enforce uniqueness
    const usedTactics = [];
    for (let r = 1; r <= 5; r++) {
        if (r !== roundNum && playerState.tactics[r]) {
            usedTactics.push(playerState.tactics[r]);
        }
    }

    const currentValue = playerState.tactics[roundNum] || "";
    
    let html = `<option value="">-- No Tactic --</option>`;
    BATTLE_TACTICS.forEach(t => {
        const isUsedElsewhere = usedTactics.includes(t.id);
        if (!isUsedElsewhere) {
            const selected = t.id === currentValue ? "selected" : "";
            html += `<option value="${t.id}" ${selected}>${t.name}</option>`;
        }
    });
    
    selectEl.innerHTML = html;
}

// Render game tracker interface elements
function renderTracker() {
    // 1a. Hide or show the tracker header row and toggle the show button next to round pills
    const trackerHeaderRow = document.querySelector(".tracker-header-row");
    const btnShowHeader = document.getElementById("btnShowHeader");
    
    if (trackerHeaderRow) {
        if (trackerState.hideHeader) {
            trackerHeaderRow.style.display = "none";
            if (btnShowHeader) btnShowHeader.style.display = "flex";
        } else {
            trackerHeaderRow.style.display = "flex";
            if (btnShowHeader) btnShowHeader.style.display = "none";
        }
    }

    // 1. Sync round selection pills
    const roundPills = document.querySelectorAll(".round-pill-btn");
    roundPills.forEach(btn => {
        const r = parseInt(btn.getAttribute("data-round"));
        if (r === trackerState.round) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 1b. Render double-turn warning badge
    const dtWarning = document.getElementById("doubleTurnWarning");
    if (dtWarning) {
        const r = trackerState.round;
        if (r > 1) {
            const prevFirst = trackerState.roundHistory[r - 1];
            const currFirst = trackerState.roundHistory[r];
            if (prevFirst && currFirst && prevFirst !== currFirst && trackerState.activePlayer === currFirst) {
                dtWarning.style.display = "inline-flex";
            } else {
                dtWarning.style.display = "none";
            }
        } else {
            dtWarning.style.display = "none";
        }
    }

    // 1c. Render automated Underdog CP & Round Controller banner
    const btnStartRoundNum = document.getElementById("btnStartRoundNum");
    if (btnStartRoundNum) btnStartRoundNum.textContent = trackerState.round;
    
    const underdogStatusText = document.getElementById("underdogStatusText");
    const underdogIndicatorDot = document.getElementById("underdogIndicatorDot");
    
    if (underdogStatusText && underdogIndicatorDot) {
        const r = trackerState.round;
        if (r === 1) {
            underdogStatusText.textContent = "Round 1 started! Both players receive 4 CP (No Underdog bonus in Round 1).";
            underdogIndicatorDot.style.background = "#6c757d";
            underdogIndicatorDot.style.boxShadow = "none";
            underdogIndicatorDot.classList.remove("underdog-active-pulse");
        } else {
            // Calculate underdog based on scores of previous rounds
            let p1Total = 0;
            let p2Total = 0;
            for (let prevR = 1; prevR < r; prevR++) {
                p1Total += trackerState.p1.scores[prevR] || 0;
                p2Total += trackerState.p2.scores[prevR] || 0;
            }
            
            if (p1Total === p2Total) {
                underdogStatusText.textContent = `Victory points tied at ${p1Total} VP! Roll-off for round order (Underdog wins ties).`;
                underdogIndicatorDot.style.background = "#ffc107";
                underdogIndicatorDot.style.boxShadow = "0 0 8px #ffc107";
                underdogIndicatorDot.classList.add("underdog-active-pulse");
            } else {
                const isP1Underdog = p1Total < p2Total;
                const underdogName = isP1Underdog ? trackerState.p1.name : trackerState.p2.name;
                underdogStatusText.innerHTML = `🏆 Underdog: <strong style="color: var(--color-gold);">${underdogName}</strong> (${isP1Underdog ? p1Total : p2Total} vs ${isP1Underdog ? p2Total : p1Total} VP). +1 CP awarded!`;
                underdogIndicatorDot.style.background = "var(--color-gold)";
                underdogIndicatorDot.style.boxShadow = "0 0 10px var(--color-gold)";
                underdogIndicatorDot.classList.add("underdog-active-pulse");
            }
        }
    }

    // 2. Sync active turn toggle
    const toggleP1 = document.getElementById("turnToggleP1");
    const toggleP2 = document.getElementById("turnToggleP2");
    if (toggleP1 && toggleP2) {
        if (trackerState.activePlayer === "p1") {
            toggleP1.classList.add("active");
            toggleP2.classList.remove("active");
        } else {
            toggleP2.classList.add("active");
            toggleP1.classList.remove("active");
        }
        
        // Sync names in toggle too
        toggleP1.textContent = trackerState.p1.name || "Player 1";
        toggleP2.textContent = trackerState.p2.name || "Opponent";
    }

    // 3. Sync phase pills
    const phasePills = document.querySelectorAll(".phase-pill");
    phasePills.forEach(btn => {
        const ph = btn.getAttribute("data-phase");
        if (ph === trackerState.phase) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 4. Sync faction select dropdowns
    const p1FactionSelect = document.getElementById("p1FactionSelect");
    const p2FactionSelect = document.getElementById("p2FactionSelect");
    
    if (p1FactionSelect && p1FactionSelect.children.length === 0) {
        p1FactionSelect.innerHTML = CORE_FACTIONS.map(f => `<option value="${f}">${f}</option>`).join("");
    }
    if (p2FactionSelect && p2FactionSelect.children.length === 0) {
        p2FactionSelect.innerHTML = CORE_FACTIONS.map(f => `<option value="${f}">${f}</option>`).join("");
    }
    
    if (p1FactionSelect) {
        if (!CORE_FACTIONS.includes(trackerState.p1.name)) {
            trackerState.p1.name = "STORMCAST ETERNALS";
        }
        p1FactionSelect.value = trackerState.p1.name;
    }
    if (p2FactionSelect) {
        if (!CORE_FACTIONS.includes(trackerState.p2.name)) {
            trackerState.p2.name = "SKAVEN";
        }
        p2FactionSelect.value = trackerState.p2.name;
    }

    // 5. Sync Role Buttons (Attacker/Defender)
    const p1RoleBtn = document.getElementById("p1RoleBtn");
    const p2RoleBtn = document.getElementById("p2RoleBtn");
    if (p1RoleBtn && p2RoleBtn) {
        if (trackerState.attacker === "p1") {
            p1RoleBtn.innerHTML = `⚔️ Attacker`;
            p1RoleBtn.style.background = "rgba(220, 53, 69, 0.2)";
            p1RoleBtn.style.borderColor = "var(--color-crimson)";
            p1RoleBtn.style.color = "#fff";
            
            p2RoleBtn.innerHTML = `🛡️ Defender`;
            p2RoleBtn.style.background = "rgba(0,0,0,0.2)";
            p2RoleBtn.style.borderColor = "rgba(255,255,255,0.1)";
            p2RoleBtn.style.color = "#aaa";
        } else {
            p1RoleBtn.innerHTML = `🛡️ Defender`;
            p1RoleBtn.style.background = "rgba(0,0,0,0.2)";
            p1RoleBtn.style.borderColor = "rgba(255,255,255,0.1)";
            p1RoleBtn.style.color = "#aaa";
            
            p2RoleBtn.innerHTML = `⚔️ Attacker`;
            p2RoleBtn.style.background = "rgba(220, 53, 69, 0.2)";
            p2RoleBtn.style.borderColor = "var(--color-crimson)";
            p2RoleBtn.style.color = "#fff";
        }
    }

    // 6. Sync Command Points displays
    const p1CpDisplay = document.getElementById("p1CpDisplay");
    const p2CpDisplay = document.getElementById("p2CpDisplay");
    if (p1CpDisplay) p1CpDisplay.textContent = trackerState.p1.cp;
    if (p2CpDisplay) p2CpDisplay.textContent = trackerState.p2.cp;

    // 7. Sync Victory Points displays
    let p1Total = 0;
    let p2Total = 0;
    for (let r = 1; r <= 5; r++) {
        const p1ScoreVal = trackerState.p1.scores[r] || 0;
        const p2ScoreVal = trackerState.p2.scores[r] || 0;
        
        p1Total += p1ScoreVal;
        p2Total += p2ScoreVal;

        const p1RScore = document.getElementById(`p1R${r}Score`);
        const p2RScore = document.getElementById(`p2R${r}Score`);
        if (p1RScore) p1RScore.textContent = p1ScoreVal;
        if (p2RScore) p2RScore.textContent = p2ScoreVal;
    }

    const p1TotalVp = document.getElementById("p1TotalVp");
    const p2TotalVp = document.getElementById("p2TotalVp");
    if (p1TotalVp) p1TotalVp.textContent = p1Total;
    if (p2TotalVp) p2TotalVp.textContent = p2Total;

    // 8. Re-populate and sync Battle Tactic dropdown selections for all rounds
    const tacticDropdowns = document.querySelectorAll(".tactic-dropdown");
    tacticDropdowns.forEach(selectEl => {
        const playerKey = selectEl.getAttribute("data-player");
        const roundNum = parseInt(selectEl.getAttribute("data-round"));
        populateTacticSelectForRound(selectEl, playerKey, roundNum);
    });

    // 9. Sync Battle Tactic completion checkboxes
    const tacticCheckboxes = document.querySelectorAll(".tactic-completed-chk");
    tacticCheckboxes.forEach(chk => {
        const playerKey = chk.getAttribute("data-player");
        const roundNum = parseInt(chk.getAttribute("data-round"));
        const playerState = trackerState[playerKey];
        
        chk.checked = playerState.completed[roundNum] || false;
        chk.disabled = !playerState.tactics[roundNum];
    });

    // 10. Sync bottom Battle Tactics Codex badges
    renderTacticsCodexBadges();
    
    lucide.createIcons();
}

// Update bottom Codex cards with badges and visual state
function renderTacticsCodexBadges() {
    const referenceCards = document.querySelectorAll(".tactic-reference-card");
    
    referenceCards.forEach(card => {
        const tacticId = card.getAttribute("data-tactic-id");
        
        let p1Round = null;
        let p1Compl = false;
        for (let r = 1; r <= 5; r++) {
            if (trackerState.p1.tactics[r] === tacticId) {
                p1Round = r;
                p1Compl = trackerState.p1.completed[r];
                break;
            }
        }

        let p2Round = null;
        let p2Compl = false;
        for (let r = 1; r <= 5; r++) {
            if (trackerState.p2.tactics[r] === tacticId) {
                p2Round = r;
                p2Compl = trackerState.p2.completed[r];
                break;
            }
        }

        // Reset styling
        card.className = "tactic-reference-card glass-card";
        
        const badgeContainer = card.querySelector(".tactic-badges-row");
        if (badgeContainer) {
            badgeContainer.innerHTML = "";
            
            if (p1Round !== null) {
                const statusIcon = p1Compl ? "🏆" : "🛡️";
                const badge = document.createElement("span");
                badge.className = "badge";
                badge.style.background = "rgba(212, 175, 55, 0.15)";
                badge.style.color = "var(--color-gold)";
                badge.style.border = "1px solid rgba(212, 175, 55, 0.3)";
                badge.style.fontSize = "0.7rem";
                badge.style.padding = "2px 6px";
                badge.innerHTML = `${statusIcon} ${trackerState.p1.name} (R${p1Round})`;
                badgeContainer.appendChild(badge);
                card.classList.add("used-by-p1");
            }
            
            if (p2Round !== null) {
                const statusIcon = p2Compl ? "🏆" : "⚔️";
                const badge = document.createElement("span");
                badge.className = "badge";
                badge.style.background = "rgba(220, 53, 69, 0.15)";
                badge.style.color = "var(--color-crimson)";
                badge.style.border = "1px solid rgba(220, 53, 69, 0.3)";
                badge.style.fontSize = "0.7rem";
                badge.style.padding = "2px 6px";
                badge.innerHTML = `${statusIcon} ${trackerState.p2.name} (R${p2Round})`;
                badgeContainer.appendChild(badge);
                
                if (p1Round !== null) {
                    card.classList.remove("used-by-p1");
                    card.classList.add("used-by-both");
                } else {
                    card.classList.add("used-by-p2");
                }
            }
        }
    });
}

// Bind tracker interaction event listeners
function setupTrackerListeners() {
    // 1. Reset Game button handler
    const btnResetTracker = document.getElementById("btnResetTracker");
    if (btnResetTracker) {
        btnResetTracker.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset the current game state? All current round scores, CPs, and tactics will be wiped clean.")) {
                resetTrackerState(true);
                renderTracker();
            }
        });
    }

    // 2. Round Pills selection
    const roundPills = document.querySelectorAll(".round-pill-btn");
    roundPills.forEach(btn => {
        btn.addEventListener("click", () => {
            const r = parseInt(btn.getAttribute("data-round"));
            trackerState.round = r;
            saveTrackerState();
            renderTracker();
        });
    });

    // 3. Active Turn Toggle
    const turnToggleP1 = document.getElementById("turnToggleP1");
    const turnToggleP2 = document.getElementById("turnToggleP2");
    if (turnToggleP1) {
        turnToggleP1.addEventListener("click", () => {
            trackerState.activePlayer = "p1";
            saveTrackerState();
            renderTracker();
        });
    }
    if (turnToggleP2) {
        turnToggleP2.addEventListener("click", () => {
            trackerState.activePlayer = "p2";
            saveTrackerState();
            renderTracker();
        });
    }

    // 4. Phase Pills selection
    const phasePills = document.querySelectorAll(".phase-pill");
    phasePills.forEach(btn => {
        btn.addEventListener("click", () => {
            const ph = btn.getAttribute("data-phase");
            trackerState.phase = ph;
            saveTrackerState();
            renderTracker();
        });
    });

    // 5. Faction Select dropdowns
    const p1FactionSelect = document.getElementById("p1FactionSelect");
    const p2FactionSelect = document.getElementById("p2FactionSelect");
    
    if (p1FactionSelect) {
        p1FactionSelect.addEventListener("change", () => {
            trackerState.p1.name = p1FactionSelect.value;
            saveTrackerState();
            
            const toggleP1 = document.getElementById("turnToggleP1");
            if (toggleP1) toggleP1.textContent = trackerState.p1.name;
            renderTacticsCodexBadges();
        });
    }
    if (p2FactionSelect) {
        p2FactionSelect.addEventListener("change", () => {
            trackerState.p2.name = p2FactionSelect.value;
            saveTrackerState();
            
            const toggleP2 = document.getElementById("turnToggleP2");
            if (toggleP2) toggleP2.textContent = trackerState.p2.name;
            renderTacticsCodexBadges();
        });
    }

    // 6. Role Toggles
    const p1RoleBtn = document.getElementById("p1RoleBtn");
    const p2RoleBtn = document.getElementById("p2RoleBtn");
    if (p1RoleBtn) {
        p1RoleBtn.addEventListener("click", () => {
            trackerState.attacker = "p1";
            saveTrackerState();
            renderTracker();
        });
    }
    if (p2RoleBtn) {
        p2RoleBtn.addEventListener("click", () => {
            trackerState.attacker = "p2";
            saveTrackerState();
            renderTracker();
        });
    }

    // 7. Command Point adjuster
    const cpAdjustBtns = document.querySelectorAll(".cp-adjust");
    cpAdjustBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const playerKey = btn.getAttribute("data-player");
            const dir = btn.getAttribute("data-dir");
            
            if (dir === "plus") {
                trackerState[playerKey].cp++;
            } else if (dir === "minus" && trackerState[playerKey].cp > 0) {
                trackerState[playerKey].cp--;
            }
            
            saveTrackerState();
            renderTracker();
        });
    });

    // 8. Victory Point scorecard adjusters
    const vpAdjustBtns = document.querySelectorAll(".vp-adjust");
    vpAdjustBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const playerKey = btn.getAttribute("data-player");
            const round = parseInt(btn.getAttribute("data-round"));
            const dir = btn.getAttribute("data-dir");
            
            if (dir === "plus") {
                trackerState[playerKey].scores[round] = (trackerState[playerKey].scores[round] || 0) + 1;
            } else if (dir === "minus" && trackerState[playerKey].scores[round] > 0) {
                trackerState[playerKey].scores[round] = (trackerState[playerKey].scores[round] || 0) - 1;
                // If score drops below 2, and tactic is completed, untoggle completed as safety
                if (trackerState[playerKey].scores[round] < 2 && trackerState[playerKey].completed[round]) {
                    trackerState[playerKey].completed[round] = false;
                }
            }
            
            saveTrackerState();
            renderTracker();
        });
    });

    // 9. Round-by-round Tactic Dropdown Changes
    const tacticDropdowns = document.querySelectorAll(".tactic-dropdown");
    tacticDropdowns.forEach(selectEl => {
        selectEl.addEventListener("change", () => {
            const playerKey = selectEl.getAttribute("data-player");
            const roundNum = parseInt(selectEl.getAttribute("data-round"));
            const val = selectEl.value;
            const playerState = trackerState[playerKey];
            
            // If tactic changed and was previously completed, remove the +2 VP bonus before changing tactic
            if (playerState.tactics[roundNum] !== val) {
                if (playerState.completed[roundNum]) {
                    playerState.scores[roundNum] = Math.max(0, playerState.scores[roundNum] - 2);
                    playerState.completed[roundNum] = false;
                }
            }
            
            playerState.tactics[roundNum] = val;
            saveTrackerState();
            renderTracker();
        });
    });

    // 10. Round-by-round Tactic Completed Toggle with Auto Scoring
    const tacticCheckboxes = document.querySelectorAll(".tactic-completed-chk");
    tacticCheckboxes.forEach(chk => {
        chk.addEventListener("change", () => {
            const playerKey = chk.getAttribute("data-player");
            const roundNum = parseInt(chk.getAttribute("data-round"));
            const checked = chk.checked;
            const playerState = trackerState[playerKey];
            
            if (checked && !playerState.completed[roundNum]) {
                playerState.scores[roundNum] = (playerState.scores[roundNum] || 0) + 2;
            } else if (!checked && playerState.completed[roundNum]) {
                playerState.scores[roundNum] = Math.max(0, playerState.scores[roundNum] - 2);
            }
            
            playerState.completed[roundNum] = checked;
            saveTrackerState();
            renderTracker();
        });
    });

    // 11. Battle Setup Guide Dialog Listeners
    const setupGuideDialog = document.getElementById("setupGuideDialog");
    const btnShowSetupGuide = document.getElementById("btnShowSetupGuide");
    const btnCloseSetupGuide = document.getElementById("btnCloseSetupGuide");
    const btnAckSetupGuide = document.getElementById("btnAckSetupGuide");
    
    if (btnShowSetupGuide && setupGuideDialog) {
        btnShowSetupGuide.addEventListener("click", () => {
            setupGuideDialog.showModal();
        });
    }
    if (btnCloseSetupGuide && setupGuideDialog) {
        btnCloseSetupGuide.addEventListener("click", () => {
            setupGuideDialog.close();
        });
    }
    if (btnAckSetupGuide && setupGuideDialog) {
        btnAckSetupGuide.addEventListener("click", () => {
            setupGuideDialog.close();
        });
    }
    
    // Setup Tab switches inside Guide Modal
    const setupTabBtns = document.querySelectorAll(".setup-tab-btn");
    setupTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active class from all tabs
            setupTabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Hide all tab contents
            const tabContents = document.querySelectorAll(".setup-tab-content");
            tabContents.forEach(content => {
                content.style.display = "none";
                content.classList.remove("active-content");
            });
            
            // Show selected tab content
            const targetId = btn.getAttribute("data-target");
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.style.display = "block";
                targetContent.classList.add("active-content");
            }
        });
    });

    // 12. "Start Round" controller button binding
    const btnStartRound = document.getElementById("btnStartRound");
    if (btnStartRound) {
        btnStartRound.addEventListener("click", () => {
            const r = trackerState.round;
            
            // Reset both players' CP to standard 4
            trackerState.p1.cp = 4;
            trackerState.p2.cp = 4;
            
            // Recalculate underdog and award +1 bonus CP
            if (r > 1) {
                let p1Total = 0;
                let p2Total = 0;
                for (let prevR = 1; prevR < r; prevR++) {
                    p1Total += trackerState.p1.scores[prevR] || 0;
                    p2Total += trackerState.p2.scores[prevR] || 0;
                }
                
                if (p1Total < p2Total) {
                    trackerState.p1.cp = 5;
                    trackerState.underdog = "p1";
                } else if (p2Total < p1Total) {
                    trackerState.p2.cp = 5;
                    trackerState.underdog = "p2";
                } else {
                    trackerState.underdog = "";
                }
            } else {
                trackerState.underdog = "";
            }
            
            // Record active player as who went first in this round
            trackerState.roundHistory[r] = trackerState.activePlayer;
            
            saveTrackerState();
            renderTracker();
            
            // Create a gorgeous notification alert
            let msg = `⚔️ Battle Round ${r} Initiated!\n\n`;
            if (trackerState.underdog) {
                const uName = trackerState.underdog === "p1" ? trackerState.p1.name : trackerState.p2.name;
                msg += `🏆 Underdog: ${uName}\n- Received +1 Underdog CP bonus (5 CP total).\n- Wins priority tiebreakers.`;
            } else if (r > 1) {
                msg += `⚖️ Scores are tied! No Underdog bonus awarded. Resolve roll-off tiebreakers manually.`;
            } else {
                msg += `• Both armies start with 4 Command Points.\n• All unspent CP from previous rounds/phases are discarded.`;
            }
            alert(msg);
        });
    }

    // 13. Hide / Show Tracker Header handlers via Event Delegation (safest for toggling elements dynamically!)
    document.addEventListener("click", (e) => {
        const hideBtn = e.target.closest("#btnHideHeader");
        if (hideBtn) {
            trackerState.hideHeader = true;
            saveTrackerState();
            renderTracker();
            return;
        }
        
        const showBtn = e.target.closest("#btnShowHeader");
        if (showBtn) {
            trackerState.hideHeader = false;
            saveTrackerState();
            renderTracker();
            return;
        }
    });
}


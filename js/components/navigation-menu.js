/**
 * @file navigation-menu.js
 * @description Premium Navigation Menu s horizontálnym headerom, dropdown submenus, mobile hamburger a active state indikátorom.
 */

import { store } from '../core/state-store.js';
import { globalBus, showNotificationToast } from './event-bus.js';

export class NavigationMenu {
    constructor(containerId = 'nav-menu-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.currentActiveMenu = null;
        this.openDropdown = null;
        this.isMobileMenuOpen = false;

        this.menuStructure = [
            {
                id: 'home',
                label: 'Domov',
                icon: '🏠',
                href: '#/',
                submenu: null
            },
            {
                id: 'map',
                label: 'Mapa',
                icon: '🗺️',
                href: '#/map',
                submenu: null
            },
            {
                id: 'search',
                label: 'Vyhľadávanie',
                icon: '🔍',
                href: '#/search',
                submenu: [
                    { id: 'search-ico', label: 'Podľa IČO', href: '#/search/ico' },
                    { id: 'search-entity', label: 'Subjekty RegisterUZ', href: '#/search/entity' },
                    { id: 'search-hives', label: 'Včelstvá', href: '#/search/hives' }
                ]
            },
            {
                id: 'parcels',
                label: 'Moje Parcely',
                icon: '🌾',
                href: '#/parcels',
                submenu: [
                    { id: 'parcels-list', label: 'Zoznam parciel', href: '#/parcels/list' },
                    { id: 'parcels-add', label: 'Nová parcela', href: '#/parcels/new' },
                    { id: 'parcels-import', label: 'Nahrať GeoJSON', href: '#/parcels/import' }
                ]
            },
            {
                id: 'tools',
                label: 'Nástroje',
                icon: '🛠️',
                href: '#/tools',
                submenu: [
                    { id: 'tools-measure', label: 'Meranie vzdialenosti', href: '#/tools/measure' },
                    { id: 'tools-collision', label: 'Detekcia kolízií', href: '#/tools/collision' },
                    { id: 'tools-export', label: 'Export mapy', href: '#/tools/export' },
                    { id: 'tools-spray', label: 'Hlásenie sprejov', href: '#/tools/spray' }
                ]
            },
            {
                id: 'profile',
                label: 'Profil',
                icon: '👤',
                href: '#/profile',
                submenu: [
                    { id: 'profile-view', label: 'Môj profil', href: '#/profile/view' },
                    { id: 'profile-entities', label: 'Moje subjekty', href: '#/profile/entities' },
                    { id: 'profile-subscription', label: 'Predplatné', href: '#/profile/subscription' }
                ]
            },
            {
                id: 'settings',
                label: 'Nastavenia',
                icon: '⚙️',
                href: '#/settings',
                submenu: [
                    { id: 'settings-general', label: 'Všeobecné', href: '#/settings/general' },
                    { id: 'settings-privacy', label: 'Súkromie a bezpečnosť', href: '#/settings/privacy' },
                    { id: 'settings-notifications', label: 'Notifikácie', href: '#/settings/notifications' },
                    { id: 'settings-logout', label: 'Odhlásiť sa', href: '#/logout', action: 'logout' }
                ]
            }
        ];

        this.init();
    }

    init() {
        if (!this.container) {
            console.error(`Container #${this.containerId} not found`);
            return;
        }

        this.render();
        this.attachEventListeners();
        this.subscribeToStore();

        window.addEventListener('resize', () => this.handleResize());
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
    }

    render() {
        this.container.innerHTML = `
            <nav class="nav-menu bg-white border-b border-slate-200 shadow-sm" role="navigation">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <!-- Desktop Navigation -->
                    <div class="nav-desktop hidden md:flex items-center justify-between h-16">
                        <!-- Logo -->
                        <a href="#/" class="nav-logo flex items-center gap-2 flex-shrink-0 group">
                            <img src="./assets/agrogis-icon.svg" alt="" class="h-8 w-8 group-hover:opacity-80 transition">
                            <span class="text-sm font-bold text-slate-900">AGROGIS</span>
                        </a>

                        <!-- Menu Items -->
                        <div class="nav-menu-items flex items-center gap-1">
                            ${this.menuStructure.map(item => this.renderMenuItem(item)).join('')}
                        </div>

                        <!-- User Status Badge -->
                        <div class="nav-user-badge flex items-center gap-3 flex-shrink-0 ml-4 pl-4 border-l border-slate-200">
                            <div class="text-right">
                                <div class="text-xs font-semibold text-slate-900">Užívateľ</div>
                                <div class="text-xs text-slate-600" id="nav-current-user">Hostí</div>
                            </div>
                            <div class="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-700">
                                U
                            </div>
                        </div>
                    </div>

                    <!-- Mobile Header -->
                    <div class="nav-mobile md:hidden flex items-center justify-between h-16">
                        <a href="#/" class="nav-logo flex items-center gap-2">
                            <img src="./assets/agrogis-icon.svg" alt="" class="h-7 w-7">
                            <span class="text-sm font-bold text-slate-900">AGROGIS</span>
                        </a>

                        <button class="nav-hamburger p-2 rounded-lg hover:bg-slate-100 transition active:bg-slate-200" 
                                aria-label="Otvoriť menu" aria-expanded="false">
                            <svg class="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Mobile Slideout Menu -->
                    <div class="nav-mobile-menu hidden absolute top-16 left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-40 md:hidden max-h-96 overflow-y-auto">
                        <div class="px-4 py-4 space-y-2">
                            ${this.menuStructure.map(item => this.renderMobileMenuItem(item)).join('')}
                        </div>
                    </div>
                </div>
            </nav>

            <!-- Dropdown Menu Container -->
            <div class="nav-dropdown-container fixed inset-0 pointer-events-none z-30 md:z-40"></div>
        `;
    }

    renderMenuItem(item) {
        const hasSubmenu = item.submenu && item.submenu.length > 0;
        const isActive = this.currentActiveMenu === item.id;

        return `
            <div class="nav-menu-item relative group" data-menu-id="${item.id}">
                <a href="${item.href}" 
                   class="nav-link px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2 transition-all
                           ${isActive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-700 hover:text-emerald-700 hover:bg-slate-50'}
                           ${hasSubmenu ? 'nav-link-submenu' : ''}"
                   data-menu-link="${item.id}">
                    <span>${item.icon}</span>
                    <span>${item.label}</span>
                    ${hasSubmenu ? '<svg class="w-4 h-4 ml-1 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>' : ''}
                </a>

                ${hasSubmenu ? `
                    <div class="nav-submenu hidden absolute left-0 mt-0 w-48 bg-white rounded-lg shadow-xl border border-slate-200 
                                 opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all duration-200 z-50 py-2">
                        ${item.submenu.map(subitem => `
                            <a href="${subitem.href}" 
                               class="submenu-item block px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                               data-submenu-link="${subitem.id}">
                                ${subitem.label}
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderMobileMenuItem(item) {
        const hasSubmenu = item.submenu && item.submenu.length > 0;

        return `
            <div class="nav-mobile-item" data-mobile-menu-id="${item.id}">
                <button class="mobile-menu-toggle w-full flex items-center justify-between px-3 py-3 rounded-md text-sm font-medium 
                               text-slate-700 hover:bg-slate-100 hover:text-emerald-700 transition-colors text-left"
                        ${hasSubmenu ? 'data-toggle-submenu' : 'data-navigate'} data-href="${item.href}">
                    <span class="flex items-center gap-2">
                        <span>${item.icon}</span>
                        <span>${item.label}</span>
                    </span>
                    ${hasSubmenu ? '<svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>' : ''}
                </button>

                ${hasSubmenu ? `
                    <div class="mobile-submenu hidden bg-slate-50 rounded-md ml-3 mt-1 overflow-hidden">
                        ${item.submenu.map(subitem => `
                            <a href="${subitem.href}" 
                               class="mobile-submenu-item block px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                               data-navigate>
                                ${subitem.label}
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    attachEventListeners() {
        // Desktop submenu hover
        document.querySelectorAll('.nav-menu-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const submenu = item.querySelector('.nav-submenu');
                if (submenu) {
                    this.openDropdown = submenu;
                }
            });

            item.addEventListener('mouseleave', () => {
                this.openDropdown = null;
            });
        });

        // Mobile hamburger
        const hamburger = this.container.querySelector('.nav-hamburger');
        if (hamburger) {
            hamburger.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Mobile submenu toggles
        document.querySelectorAll('[data-toggle-submenu]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const submenu = btn.closest('.nav-mobile-item').querySelector('.mobile-submenu');
                if (submenu) {
                    submenu.classList.toggle('hidden');
                    const icon = btn.querySelector('svg');
                    if (icon) icon.classList.toggle('rotate-180');
                }
            });
        });

        // Navigation links
        document.querySelectorAll('[data-navigate]').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('data-href') || link.getAttribute('href');
                if (href && href !== '#/logout') {
                    this.setActiveMenu(link.getAttribute('data-menu-link') || href.split('/')[1]);
                    this.closeMobileMenu();
                    globalBus.emit('navigation:changed', { href });
                } else if (href === '#/logout') {
                    e.preventDefault();
                    this.handleLogout();
                }
            });
        });

        // Desktop menu links
        document.querySelectorAll('[data-menu-link]').forEach(link => {
            link.addEventListener('click', (e) => {
                const menuId = link.getAttribute('data-menu-link');
                if (menuId && !link.closest('.nav-submenu')) {
                    this.setActiveMenu(menuId);
                    globalBus.emit('navigation:changed', { menuId });
                }
            });
        });
    }

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        const mobileMenu = this.container.querySelector('.nav-mobile-menu');
        const hamburger = this.container.querySelector('.nav-hamburger');

        if (this.isMobileMenuOpen) {
            mobileMenu.classList.remove('hidden');
            hamburger.setAttribute('aria-expanded', 'true');
        } else {
            mobileMenu.classList.add('hidden');
            hamburger.setAttribute('aria-expanded', 'false');
        }
    }

    closeMobileMenu() {
        this.isMobileMenuOpen = false;
        const mobileMenu = this.container.querySelector('.nav-mobile-menu');
        const hamburger = this.container.querySelector('.nav-hamburger');
        if (mobileMenu) mobileMenu.classList.add('hidden');
        if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    }

    handleResize() {
        if (window.innerWidth >= 768) {
            this.closeMobileMenu();
        }
    }

    handleOutsideClick(e) {
        if (!e.target.closest('.nav-menu') && !e.target.closest('.nav-dropdown-container')) {
            this.openDropdown = null;
        }
    }

    setActiveMenu(menuId) {
        this.currentActiveMenu = menuId;
        this.render();
        this.attachEventListeners();
    }

    subscribeToStore() {
        store.subscribe((state) => {
            const userDisplay = document.getElementById('nav-current-user');
            if (userDisplay && state.currentUser) {
                userDisplay.textContent = state.currentUser.name || 'Užívateľ';
            }
        });
    }

    handleLogout() {
        if (confirm('Ste si istí, že sa chcete odhlásiť?')) {
            store.clearUserSession();
            globalBus.emit('auth:logout');
            showNotificationToast('Boli ste úspešne odhlásení', 'success');
            window.location.hash = '#/';
        }
    }

    setCurrentUser(user) {
        const userDisplay = document.getElementById('nav-current-user');
        if (userDisplay && user) {
            userDisplay.textContent = user.name || 'Užívateľ';
            const badge = this.container.querySelector('.nav-user-badge');
            if (badge && user.name) {
                const initial = user.name.charAt(0).toUpperCase();
                const initials = badge.querySelector('div:last-child');
                if (initials) initials.textContent = initial;
            }
        }
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        document.removeEventListener('click', (e) => this.handleOutsideClick(e));
        window.removeEventListener('resize', () => this.handleResize());
    }
}

export default NavigationMenu;

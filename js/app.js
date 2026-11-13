import { store } from './core/state-store.js';
import { AgroMapEngine } from './components/map-engine.js';
import { backendApi } from './services/backend-api.js';
import { AgroApiService } from './services/api.js';

const personaConfig = {
  BEE_PRO: {
    icon: '🐝',
    badge: 'Profi Včelár',
    bannerTitle: 'Režim: Profi Včelár',
    bannerDesc: 'CEVZ, kočovanie a 3 km ochranné pásmo pre včelstvá',
    headerRole: 'Profi Včelár',
    userIcon: '🐝',
    accent: 'amber'
  },
  BEE_HOBBY: {
    icon: '🍯',
    badge: 'Hobby Včelár',
    bannerTitle: 'Režim: Hobby Včelár',
    bannerDesc: 'Jednoduchá mapa pre drobné včelárov a základné kontrolné nástroje',
    headerRole: 'Hobby Včelár',
    userIcon: '🍯',
    accent: 'amber'
  },
  AGRO_PRO: {
    icon: '🚜',
    badge: 'Profi Poľnohospodár',
    bannerTitle: 'Režim: Profi Poľnohospodár',
    bannerDesc: 'IČO RegisterUZ, LPIS parcely a ochrana včelstiev v 3 km pásme',
    headerRole: 'Profi Poľnohospodár',
    userIcon: '🚜',
    accent: 'emerald'
  },
  AGRO_HOBBY: {
    icon: '🌱',
    badge: 'Hobby Poľnohospodár',
    bannerTitle: 'Režim: Hobby Poľnohospodár',
    bannerDesc: 'Rýchly prehľad poľnohospodárskej plochy a jednoduché nástroje',
    headerRole: 'Hobby Poľnohospodár',
    userIcon: '🌱',
    accent: 'emerald'
  }
};

const appState = {
  activePersona: 'AGRO_PRO',
  landingVisible: true,
  activeTab: 'search',
  activeTool: null,
  authMode: 'login',
  sidebarCollapsed: false
};

let appMapEngine = null;
let pendingHiveCoordinates = null;
const publicApi = new AgroApiService();

const $ = (id) => document.getElementById(id);

function getCurrentUserSafe() {
  const user = store.getState().currentUser;
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

const accountRoleConfig = {
  AGRO: { label: 'Poľnohospodár', icon: '🚜' },
  AGRO_PRO: { label: 'Profi poľnohospodár', icon: '🚜' },
  BEEKEEPER: { label: 'Profi včelár', icon: '🐝' },
  BEE_HOBBY: { label: 'Hobby včelár', icon: '🍯' },
  BEE_BEGINNER: { label: 'Začiatočný včelár', icon: '🌼' },
  GARDENER: { label: 'Záhradkár', icon: '🌻' },
  GARDEN_NEW: { label: 'Budúci pestovateľ', icon: '🌱' }
};

function getAccountRoleInfo(role) {
  return accountRoleConfig[role] || { label: 'Poľnohospodár', icon: '🚜' };
}

function renderProfileMetadata(currentUser) {
  if (!currentUser) return;
  const roleInfo = getAccountRoleInfo(currentUser.role);
  const location = currentUser.profileLocation
    && Number.isFinite(Number(currentUser.profileLocation.lat))
    && Number.isFinite(Number(currentUser.profileLocation.lng))
    ? `${Number(currentUser.profileLocation.lat).toFixed(5)}, ${Number(currentUser.profileLocation.lng).toFixed(5)}`
    : 'Nepridelená';
  const created = currentUser.createdAt && !Number.isNaN(Date.parse(currentUser.createdAt))
    ? new Date(currentUser.createdAt).toLocaleDateString('sk-SK')
    : '—';

  const values = {
    'pmeta-role': `${roleInfo.icon} ${roleInfo.label}`,
    'pmeta-company': currentUser.companyName || '—',
    'pmeta-code': currentUser.ico || currentUser.cevz || '—',
    'pmeta-lpis': currentUser.lpisId || '—',
    'pmeta-location': location,
    'pmeta-phone': currentUser.phone || '—',
    'pmeta-address': currentUser.address || '—',
    'pmeta-created': created
  };
  for (const [id, value] of Object.entries(values)) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  const verified = $('pmeta-verified');
  if (verified) {
    verified.textContent = currentUser.isVerified ? '✅ Overený subjekt' : '⏳ Čaká na overenie';
    verified.classList.toggle('bg-emerald-100', Boolean(currentUser.isVerified));
    verified.classList.toggle('text-emerald-800', Boolean(currentUser.isVerified));
    verified.classList.toggle('bg-stone-200', !currentUser.isVerified);
    verified.classList.toggle('text-slate-600', !currentUser.isVerified);
  }
}

function syncAuthUi() {
  const currentUser = getCurrentUserSafe();
  const guest = $('header-guest-controls');
  const userControls = $('header-user-controls');
  const sidebarGuest = $('sidebar-portal-guest');
  const sidebarUser = $('sidebar-portal-user');

  if (guest) guest.classList.toggle('hidden', Boolean(currentUser));
  if (userControls) userControls.classList.toggle('hidden', !currentUser);

  if (sidebarGuest) sidebarGuest.classList.toggle('hidden', Boolean(currentUser));
  if (sidebarUser) sidebarUser.classList.toggle('hidden', !currentUser);

  if (!currentUser) return;

  const roleInfo = getAccountRoleInfo(currentUser.role);
  const userDisplay = $('user-display');
  const roleDisplay = $('role-display');
  const headerUserIcon = $('header-user-icon');
  const spName = $('sp-user-name');
  const spMeta = $('sp-user-meta');
  const spRole = $('sp-user-role-badge');
  const dashUserName = $('dash-user-name');
  const dashUserRole = $('dash-user-role');
  const dashUserSub = $('dash-user-sub');
  const dashAvatar = $('dash-avatar');

  if (userDisplay) userDisplay.textContent = currentUser.name || 'Používateľ';
  if (roleDisplay) roleDisplay.textContent = roleInfo.label;
  if (headerUserIcon) headerUserIcon.textContent = roleInfo.icon;
  if (spName) spName.textContent = currentUser.name || 'Používateľ';
  if (spMeta) spMeta.textContent = currentUser.ico || currentUser.cevz || 'Bez registračného kódu';
  if (spRole) spRole.textContent = roleInfo.label;
  if (dashUserName) dashUserName.textContent = currentUser.name || 'Používateľ';
  if (dashUserRole) dashUserRole.textContent = roleInfo.label.toUpperCase();
  if (dashUserSub) dashUserSub.textContent = `${currentUser.ico || currentUser.cevz || 'Bez kódu'} • ${currentUser.email || ''}`;
  if (dashAvatar) dashAvatar.textContent = roleInfo.icon;

  renderProfileMetadata(currentUser);
}

function ensureDemoUsersStored() {
  const key = 'agrogis_registered_users_v4';
  const existing = localStorage.getItem(key);
  if (!existing) {
    const demoUsers = [
      {
        id: 'usr-demo-agro-1',
        role: 'AGRO',
        name: 'PD Devio Nové Sady',
        email: 'agronom@pddevio.sk',
        passwordHash: 'Agro2026!',
        ico: '00190225',
        phone: '+421 905 412 880',
        address: 'Nové Sady 186, 951 24 Nové Sady',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-demo-bee-1',
        role: 'BEEKEEPER',
        name: 'Včelnica Kráľová pri Senci',
        email: 'kralova@vcelari-senec.sk',
        passwordHash: 'Vcela2026!',
        ico: '',
        cevz: 'CEVZ-BA-0142',
        phone: '+421 911 228 910',
        address: 'Kráľová pri Senci 42, 900 50 Kráľová pri Senci',
        createdAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(key, JSON.stringify(demoUsers));
  }
}

function getStoredUsers() {
  ensureDemoUsersStored();
  try {
    return JSON.parse(localStorage.getItem('agrogis_registered_users_v4') || '[]');
  } catch {
    return [];
  }
}

function saveStoredUsers(users) {
  localStorage.setItem('agrogis_registered_users_v4', JSON.stringify(users));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function updatePersonaUi(personaKey) {
  const persona = personaConfig[personaKey] || personaConfig.AGRO_PRO;

  const personaBadgeText = $('persona-badge-text');
  const personaBadgeIcon = $('persona-badge-icon');
  const sidebarPersonaTitle = $('sidebar-persona-title');
  const sidebarPersonaDesc = $('sidebar-persona-desc');
  const sidebarPersonaIcon = $('sidebar-persona-icon');
  const headerUserIcon = $('header-user-icon');
  const userDisplay = $('user-display');
  const roleDisplay = $('role-display');

  if (personaBadgeText) personaBadgeText.textContent = persona.badge;
  if (personaBadgeIcon) personaBadgeIcon.textContent = persona.icon;
  if (sidebarPersonaTitle) sidebarPersonaTitle.textContent = persona.bannerTitle;
  if (sidebarPersonaDesc) sidebarPersonaDesc.textContent = persona.bannerDesc;
  if (sidebarPersonaIcon) sidebarPersonaIcon.textContent = persona.icon;
  if (headerUserIcon) headerUserIcon.textContent = persona.userIcon;
  if (userDisplay) userDisplay.textContent = persona.badge;
  if (roleDisplay) roleDisplay.textContent = persona.headerRole;

  const activeModeBadge = $('active-mode-badge');
  const activeModeText = $('active-mode-text');
  if (activeModeBadge) {
    activeModeBadge.classList.remove('hidden');
    activeModeBadge.classList.add('flex');
  }
  if (activeModeText) activeModeText.textContent = persona.badge;

  const hobbyAssistant = $('hobby-simple-assistant');
  if (hobbyAssistant) {
    const isHobby = personaKey.includes('HOBBY');
    hobbyAssistant.classList.toggle('hidden', !isHobby);
  }
}

function showToast(message, tone = 'success') {
  const container = $('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 border-emerald-500',
    warning: 'bg-amber-500 border-amber-400',
    info: 'bg-sky-600 border-sky-500',
    danger: 'bg-rose-600 border-rose-500'
  };

  toast.className = `border text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg ${colors[tone] || colors.success}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

// Mapa (#map-stage) žije na jednom mieste a presúva sa medzi úvodnou obrazovkou
// a hlavnou aplikáciou, aby išlo vždy o tú istú živú ZBGIS mapu bez opätovnej inicializácie.
function relocateMapStage(hostId) {
  const stage = $('map-stage');
  const host = $(hostId);
  if (!stage || !host || stage.parentElement === host) return;
  host.appendChild(stage);
  if (appMapEngine && appMapEngine.map) {
    appMapEngine.map.invalidateSize();
    requestAnimationFrame(() => appMapEngine.map.invalidateSize());
  }
}

function openLandingPortal() {
  const overlay = $('landing-portal-overlay');
  if (!overlay) return;
  overlay.classList.remove('landing-hidden');
  overlay.scrollTop = 0;
  appState.landingVisible = true;
  relocateMapStage('landing-map-frame');
}

function closeLandingPortal() {
  const overlay = $('landing-portal-overlay');
  if (!overlay) return;
  overlay.classList.add('landing-hidden');
  appState.landingVisible = false;
  relocateMapStage('map-mount');
}

function selectUserPersona(personaKey) {
  appState.activePersona = personaKey;
  store.setState({ currentPersona: personaKey });
  updatePersonaUi(personaKey);
  closeLandingPortal();
  showToast(`Vybraný režim: ${personaConfig[personaKey]?.badge || 'Používateľ'}`, 'success');
}

function toggleLeftSidebar() {
  const sidebar = $('left-sidebar');
  if (!sidebar) return;
  appState.sidebarCollapsed = !appState.sidebarCollapsed;
  const workspace = $('app-workspace');
  if (workspace) {
    workspace.classList.toggle(
      'mobile-sidebar-collapsed',
      appState.sidebarCollapsed && window.matchMedia('(max-width: 767px)').matches
    );
  }
  sidebar.classList.toggle('w-0', appState.sidebarCollapsed);
  sidebar.classList.toggle('overflow-hidden', appState.sidebarCollapsed);
  sidebar.classList.toggle('opacity-0', appState.sidebarCollapsed);
  sidebar.classList.toggle('md:w-[410px]', !appState.sidebarCollapsed);
  sidebar.classList.toggle('w-80', !appState.sidebarCollapsed);
}

function switchSidebarTab(tabName) {
  appState.activeTab = tabName;

  const tabs = ['search', 'layers', 'tools', 'portal'];
  tabs.forEach((tab) => {
    const button = $('tab-btn-' + tab);
    const panel = $('tab-panel-' + tab);

    if (button) {
      button.classList.toggle('active-eco-tab', tab === tabName);
      button.classList.toggle('text-slate-600', tab !== tabName);
      button.classList.toggle('text-amber-800', tab === 'portal' && tab !== tabName);
      button.classList.toggle('hover:text-slate-900', tab !== tabName);
    }

    if (panel) panel.classList.toggle('hidden', tab !== tabName);
  });
}

function openAuthModal(mode = 'login') {
  appState.authMode = mode;
  switchAuthModalTab(mode);
  const modal = $('auth-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  showToast(mode === 'login' ? 'Prihlasovací formulár je otvorený' : 'Registrácia je otvorená', 'info');
}

function closeAuthModal() {
  const modal = $('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function switchAuthModalTab(tabName) {
  appState.authMode = tabName;
  const loginForm = $('form-login');
  const registerForm = $('form-register');
  const loginButton = $('auth-tab-login');
  const registerButton = $('auth-tab-register');

  const isLogin = tabName === 'login';
  if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
  if (registerForm) registerForm.classList.toggle('hidden', isLogin);
  if (loginButton) {
    loginButton.classList.toggle('bg-emerald-600', isLogin);
    loginButton.classList.toggle('text-white', isLogin);
    loginButton.classList.toggle('text-slate-600', !isLogin);
  }
  if (registerButton) {
    registerButton.classList.toggle('bg-emerald-600', !isLogin);
    registerButton.classList.toggle('text-white', !isLogin);
    registerButton.classList.toggle('text-slate-600', isLogin);
  }
}

function populateProfileForm(user = getCurrentUserSafe()) {
  if (!user) return;

  const profName = $('prof-name');
  const profEmail = $('prof-email');
  const profIco = $('prof-ico');
  const profPhone = $('prof-phone');
  const profAddress = $('prof-address');
  const profCompany = $('prof-company');
  const profLpisId = $('prof-lpis-id');
  const profLocation = $('prof-location');

  if (profName) profName.value = user.name || '';
  if (profEmail) profEmail.value = user.email || '';
  if (profIco) {
    const code = user.role === 'BEEKEEPER' ? (user.cevz || user.ico || '') : (user.ico || user.cevz || '');
    profIco.value = code;
  }
  if (profPhone) profPhone.value = user.phone || '';
  if (profAddress) profAddress.value = user.address || '';
  if (profCompany) profCompany.value = user.companyName || user.name || '';
  if (profLpisId) profLpisId.value = user.lpisId || '';
  if (profLocation) {
    const loc = user.profileLocation;
    profLocation.value = loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Nespridelené';
  }
}

function openUserDashboardModal() {
  const modal = $('user-dashboard-modal');
  if (!modal) return;
  switchDashboardSection('profile');
  populateProfileForm();
  modal.classList.remove('hidden');
  refreshDashboardStats();
  syncLpisParcelsFromApi();
}

function closeUserDashboardModal() {
  const modal = $('user-dashboard-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

async function handleLogoutUser() {
  try { await backendApi.logout(); } catch {}
  store.setState({ currentUser: null });
  syncAuthUi();
  const headerGuestControls = $('header-guest-controls');
  const headerUserControls = $('header-user-controls');
  if (headerGuestControls) headerGuestControls.classList.remove('hidden');
  if (headerUserControls) headerUserControls.classList.add('hidden');
  showToast('Bol si odhlásený', 'info');
}

function setBaseMap(name) {
  const mapPalette = {
    ortho: 'radial-gradient(circle at center, #eef3ea 0%, #dde8db 100%)',
    zbgis: 'radial-gradient(circle at center, #f5f7f3 0%, #dde4d8 100%)',
    terrain: 'radial-gradient(circle at center, #dfe8d5 0%, #c0d7af 100%)',
    dark: 'radial-gradient(circle at center, #111827 0%, #1e293b 100%)'
  };

  const map = $('map');
  if (map) map.style.background = mapPalette[name] || mapPalette.ortho;

  if (appMapEngine) {
    appMapEngine.setBaseLayer(name);
  }

  const buttons = document.querySelectorAll('.basemap-btn');
  buttons.forEach((button) => button.classList.remove('active-basemap'));

  const activeButton = document.getElementById(`btn-base-${name}`);
  if (activeButton) activeButton.classList.add('active-basemap');

  const floatButtons = document.querySelectorAll('.float-map-pill');
  floatButtons.forEach((button) => button.classList.remove('active-float-pill'));
  const activeFloat = document.getElementById(`float-base-${name}`);
  if (activeFloat) activeFloat.classList.add('active-float-pill');

  showToast(`Mapa prepnutá na: ${name.toUpperCase()}`, 'info');
}

function finishPolygonDrawing() {
  const badge = $('active-mode-badge');
  if (badge) badge.classList.add('hidden');
  if (appMapEngine) {
    appMapEngine.finishDrawingParcel();
  }
  showToast('Parcelná oblasť bola uložená', 'success');
}

function cancelActiveModes() {
  const badge = $('active-mode-badge');
  if (badge) badge.classList.add('hidden');
  appState.activeTool = null;
  store.setState({ interactionMode: 'NONE' });
  showToast('Aktívny režim bol zrušený', 'warning');
}

function quickToggleKatasterButton() {
  const button = $('float-kataster-btn');
  if (button) {
    const active = button.dataset.active === 'true';
    button.dataset.active = String(!active);
    button.classList.toggle('bg-sky-100', !active);
    button.classList.toggle('text-sky-800', !active);
  }
  store.setState({ isKatasterVisible: !(store.getState().isKatasterVisible) });
  showToast('Katasterová vrstva prepnutá', 'info');
}

function toggleSpraySimulation() {
  appState.activeTool = 'spray';
  store.setState({ interactionMode: 'SPRAY' });
  const badge = $('active-mode-badge');
  const label = $('active-mode-text');
  if (badge) badge.classList.remove('hidden');
  if (label) label.textContent = 'Simulácia postreku';
  showToast('Simulácia postreku aktivovaná', 'warning');
}

function toggleAddHiveMode() {
  appState.activeTool = 'hive';
  store.setState({ interactionMode: 'ADD_HIVE' });
  const badge = $('active-mode-badge');
  const label = $('active-mode-text');
  if (badge) badge.classList.remove('hidden');
  if (label) label.textContent = 'Pridanie včelstva';
  showToast('Režim pridania včelstva je zapnutý', 'success');
}

function toggleDrawPolygonMode() {
  appState.activeTool = 'draw';
  store.setState({ interactionMode: 'DRAW_PARCEL' });
  const badge = $('active-mode-badge');
  const label = $('active-mode-text');
  if (badge) badge.classList.remove('hidden');
  if (label) label.textContent = 'Kreslenie parcely';
  showToast('Režim kreslenia parcely aktivovaný', 'success');
}

function toggleIdentifyMode() {
  appState.activeTool = 'identify';
  store.setState({ interactionMode: 'IDENTIFY' });
  const badge = $('active-mode-badge');
  const label = $('active-mode-text');
  if (badge) badge.classList.remove('hidden');
  if (label) label.textContent = 'Identifikácia bodu';
  showToast('Geodetická identifikácia aktivovaná', 'info');
}

function toggleMeasureMode() {
  appState.activeTool = 'measure';
  store.setState({ interactionMode: 'MEASURE' });
  const badge = $('active-mode-badge');
  const label = $('active-mode-text');
  if (badge) badge.classList.remove('hidden');
  if (label) label.textContent = 'Meranie vzdialenosti';
  showToast('Merač vzdialenosti je zapnutý', 'info');
}

function locateUserGPS() {
  if (!navigator.geolocation) {
    showToast('GPS nie je podporované v tomto prehliadači', 'warning');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(5);
      const lng = position.coords.longitude.toFixed(5);
      const content = $('analysis-content');
      if (content) {
        content.innerHTML = `
          <div class="space-y-2">
            <div class="font-extrabold text-emerald-800 uppercase tracking-wider">Moja poloha GPS</div>
            <div>Lat: <span class="font-mono text-slate-800">${lat}</span></div>
            <div>Lng: <span class="font-mono text-slate-800">${lng}</span></div>
          </div>
        `;
      }
      showToast('GPS poloha bola načítaná', 'success');
    },
    () => showToast('Nepodarilo sa načítať GPS polohu', 'warning')
  );
}

function resetSlovakiaView() {
  if (appMapEngine && appMapEngine.map) {
    appMapEngine.map.setView([48.35, 17.75], 9);
  }
  showToast('Zobrazenie bolo resetované na celé Slovensko', 'info');
}

function clearAllMapAnalyses() {
  const content = $('analysis-content');
  if (content) {
    content.innerHTML = '<div class="text-slate-500 italic">Mapa je pripravená na nový prieskum.</div>';
  }
  if (appMapEngine) appMapEngine.clearAnalyses();
  showToast('Všetky analýzy boli vyčistené', 'info');
}

function clearSearchInput() {
  const input = $('ico-input');
  if (input) input.value = '';
}

function quickSelectICO(value) {
  const input = $('ico-input');
  if (input) input.value = value;
  showToast(`Vybrané IČO: ${value}`, 'info');
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function handleEntityVerification() {
  const input = $('ico-input');
  const value = input ? input.value.trim() : '';
  const panel = $('analysis-content');
  const spinner = $('search-spinner');

  if (!panel) return;
  if (!value) {
    panel.innerHTML = '<div class="text-rose-700 font-bold">Zadajte IČO, obec alebo názov subjektu.</div>';
    showToast('Vyplňte pole pre overenie subjektu', 'warning');
    return;
  }

  const state = store.getState();
  const query = normalizeQuery(value);
  const localMatch = [...state.entities].find((entity) => {
    const ico = normalizeQuery(entity.ico);
    const name = normalizeQuery(entity.name);
    const city = normalizeQuery(entity.city);
    const address = normalizeQuery(entity.address);
    return ico.includes(query) || name.includes(query) || city.includes(query) || address.includes(query);
  });
  let match = null;

  if (spinner) spinner.classList.remove('hidden');
  try {
    if (/^\d{6,10}$/.test(value.replace(/\s/g, ''))) {
      match = await backendApi.verifyEntity(value);
      if (!match && localMatch) match = localMatch;
    } else {
      const results = await backendApi.searchEntities(value);
      match = results[0] || localMatch;
    }
  } catch (error) {
    if (!backendApi.isUnavailable(error) && error.status !== 404) {
      showToast(error.message || 'Vyhľadávanie subjektu zlyhalo', 'warning');
    }
    match = localMatch;
    if (!match && /^\d{6,10}$/.test(value.replace(/\s/g, '')) && backendApi.isUnavailable(error)) {
      match = await publicApi.fetchEntityByICO(value);
    }
  } finally {
    if (spinner) spinner.classList.add('hidden');
  }

  if (!match) {
    panel.innerHTML = `<div class="text-amber-700 font-bold">Nenašiel sa subjekt pre: <span class="font-mono text-slate-800">${escapeHtml(value)}</span></div>`;
    showToast('Subjekt nebol nájdený v lokálnom registri.', 'warning');
    return;
  }

  if (!Number.isFinite(Number(match.lat)) || !Number.isFinite(Number(match.lng))) {
    const position = await publicApi.geocodeAddress(match.address || match.city || match.name, match.city || '');
    match = { ...match, lat: position.lat, lng: position.lng };
  }

  store.setState({ activeEntity: match });
  if (store.upsertEntity) store.upsertEntity(match);
  if (appMapEngine) {
    appMapEngine.renderCompanyMarker(match.lat, match.lng, match.name, match.ico, match.address);
    appMapEngine.renderLpisParcels(match.ico);
  }

  const ownedParcels = store.getState().lpisParcels.filter((parcel) => parcel.ownerIco === match.ico);
  panel.innerHTML = `
    <div class="space-y-2">
      <div class="font-extrabold text-emerald-800 uppercase tracking-wider">Overovanie subjektu</div>
      <div><span class="font-bold text-slate-800">Názov:</span> ${escapeHtml(match.name)}</div>
      <div><span class="font-bold text-slate-800">IČO:</span> <span class="font-mono text-slate-800">${escapeHtml(match.ico)}</span></div>
      <div><span class="font-bold text-slate-800">Sídlo:</span> ${escapeHtml(match.address)}</div>
      <div>Zdroj: <span class="text-emerald-700 font-bold">${escapeHtml(match.source || 'RegisterUZ')}</span></div>
      <div>Pozemky uložené v aplikácii: <span class="text-emerald-700 font-bold">${ownedParcels.length}</span></div>
      <div>Umiestnenie značky: <span class="text-slate-700">sídlo subjektu, nie jeho polia</span></div>
    </div>
  `;

  showToast(`Sídlo subjektu ${match.name} je zobrazené na mape`, 'success');
}

function selectCadastreRegister(register) {
  const c = $('btn-reg-ckn');
  const e = $('btn-reg-ekn');
  if (c && e) {
    c.classList.toggle('bg-sky-600', register === 'C');
    c.classList.toggle('text-white', register === 'C');
    c.classList.toggle('text-slate-600', register !== 'C');
    e.classList.toggle('bg-sky-600', register === 'E');
    e.classList.toggle('text-white', register === 'E');
    e.classList.toggle('text-slate-600', register !== 'E');
  }
  store.setState({ selectedCadastreRegister: register });
  showToast(`Vybraný register: ${register}-KN`, 'info');
}

function quickSearchParcel(register, ku, parcel) {
  const kuInput = $('cadastre-ku-input');
  const parcelInput = $('cadastre-parcel-input');
  if (kuInput) kuInput.value = ku;
  if (parcelInput) parcelInput.value = parcel;
  selectCadastreRegister(register);
  showToast(`Parcelné vyhľadanie: ${register}-KN ${parcel} ${ku}`, 'info');
}

function handleCadastreParcelSearch() {
  const ku = $('cadastre-ku-input')?.value || 'Petržalka';
  const parcel = $('cadastre-parcel-input')?.value || '1204/1';
  const panel = $('analysis-content');
  const register = store.getState().selectedCadastreRegister || 'C';

  if (!panel) return;
  const match = store.getState().cadastreParcels.find((entry) => {
    const sameRegister = entry.register === register;
    const sameParcel = entry.parcelNumber && entry.parcelNumber.toString() === parcel.trim();
    const sameKu = entry.kuName && entry.kuName.toLowerCase().includes(ku.toLowerCase());
    return sameRegister && (sameParcel || sameKu);
  });

  if (!match) {
    panel.innerHTML = `<div class="text-amber-700 font-bold">Parcela ${register}-KN ${parcel} v katastrálnom území ${ku} nebola nájdená.</div>`;
    showToast('Katasterové vyhľadanie nebolo nájdené', 'warning');
    return;
  }

  if (appMapEngine) {
    appMapEngine.renderCadastreParcel(match);
  }

  panel.innerHTML = `
    <div class="space-y-2">
      <div class="font-extrabold text-sky-800 uppercase tracking-wider">Kataster SR</div>
      <div>Katastrálne územie: <span class="font-mono text-slate-800">${match.kuName}</span></div>
      <div>Parcela: <span class="font-mono text-slate-800">${match.parcelNumber}</span></div>
      <div>Výmera: <span class="text-emerald-700 font-bold">${match.areaHa} ha</span></div>
      <div>Stav: <span class="text-emerald-700 font-bold">Parcelná vrstva pripravená</span></div>
    </div>
  `;

  showToast(`Parcelná vrstva ${match.register}-KN ${match.parcelNumber} bola načítaná`, 'success');
}

function refreshDashboardStats() {
  const state = store.getState();
  const stats = {
    parcels: document.getElementById('dash-stat-parcels'),
    hives: document.getElementById('dash-stat-hives'),
    alerts: document.getElementById('dash-stat-alerts')
  };

  if (stats.parcels) {
    const userIco = state.currentUser?.ico || '';
    const parcels = state.lpisParcels.filter((p) => p.ownerIco === userIco);
    const totalHa = parcels.reduce((sum, p) => sum + Number(p.areaHa || 0), 0);
    stats.parcels.textContent = `${parcels.length} blokov (${totalHa.toFixed(2)} ha)`;
  }
  if (stats.hives) {
    const hives = state.hives || [];
    const totalColonies = hives.reduce((sum, hive) => sum + Number(hive.count || 0), 0);
    stats.hives.textContent = `${hives.length} stanovíšť (${totalColonies} rodín)`;
  }
  if (stats.alerts) {
    const alerts = state.sprayAlerts || [];
    stats.alerts.textContent = `${alerts.length} záznamov`;
  }

  renderDashboardLists(state);
}

function createEmptyListItem(text) {
  const el = document.createElement('div');
  el.className = 'text-slate-500 italic text-[11px] py-2';
  el.textContent = text;
  return el;
}

function renderDashboardLists(state) {
  const userIco = state.currentUser?.ico || '';
  const parcels = state.lpisParcels.filter((p) => p.ownerIco === userIco);

  const parcelsList = $('dash-my-parcels-list');
  if (parcelsList) {
    parcelsList.replaceChildren();
    if (!parcels.length) {
      parcelsList.appendChild(createEmptyListItem('Pod vaším účtom nie sú evidované žiadne pôdne bloky. Nakreslite ich na mape alebo spárujte LPIS ID.'));
    }
    parcels.forEach((parcel) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'w-full text-left bg-white hover:bg-emerald-50 border border-stone-200 rounded-xl px-3 py-2 transition';

      const title = document.createElement('div');
      title.className = 'font-bold text-emerald-800 font-mono text-[11px]';
      title.textContent = `${parcel.id} • ${Number(parcel.areaHa || 0).toFixed(2)} ha`;
      const detail = document.createElement('div');
      detail.className = 'text-slate-600 text-[11px] mt-0.5';
      detail.textContent = `${parcel.crop || 'Neurčená plodina'} • ${parcel.kUzemie || ''}`;

      item.append(title, detail);
      item.addEventListener('click', () => focusLpisParcelOnMap(parcel.id));
      parcelsList.appendChild(item);
    });
  }

  const hivesList = $('dash-my-hives-list');
  if (hivesList) {
    const hives = state.hives || [];
    hivesList.replaceChildren();
    if (!hives.length) {
      hivesList.appendChild(createEmptyListItem('Zatiaľ nemáte pridané žiadne stanovište. Pridajte ho tlačidlom vyššie.'));
    }
    hives.forEach((hive) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'w-full text-left bg-white hover:bg-amber-50 border border-stone-200 rounded-xl px-3 py-2 transition';

      const title = document.createElement('div');
      title.className = 'font-bold text-amber-800 text-[11px]';
      title.textContent = `🐝 ${hive.name || 'Stanovište'} • ${Number(hive.count || 0)} rodín`;
      const detail = document.createElement('div');
      detail.className = 'text-slate-600 font-mono text-[11px] mt-0.5';
      detail.textContent = `${hive.cevz || 'bez CEVZ'} • ${Number(hive.lat).toFixed(4)}, ${Number(hive.lng).toFixed(4)}`;

      item.append(title, detail);
      item.addEventListener('click', () => focusHiveOnMap(hive.id));
      hivesList.appendChild(item);
    });
  }

  const alertsTable = $('dash-alerts-table');
  if (alertsTable) {
    const alerts = state.sprayAlerts || [];
    alertsTable.replaceChildren();
    if (!alerts.length) {
      alertsTable.appendChild(createEmptyListItem('Zatiaľ neboli zaznamenané žiadne hlásenia postrekov v ochrannom pásme.'));
    }
    alerts.forEach((alert) => {
      const item = document.createElement('div');
      item.className = 'bg-white border border-stone-200 rounded-xl px-3 py-2 text-[11px] text-slate-700 space-y-1';

      const head = document.createElement('div');
      head.className = 'flex justify-between gap-2 font-bold text-slate-800';
      const title = document.createElement('span');
      title.textContent = `⚠️ ${alert.title || alert.type || 'Hlásenie postreku'}`;
      const when = document.createElement('span');
      when.className = 'font-mono text-slate-500 shrink-0';
      when.textContent = alert.timestamp || (alert.createdAt && !Number.isNaN(Date.parse(alert.createdAt))
        ? new Date(alert.createdAt).toLocaleString('sk-SK')
        : '');
      head.append(title, when);

      const detail = document.createElement('div');
      detail.className = 'text-slate-600';
      const impact = Number.isFinite(Number(alert.affectedHivesCount))
        ? `Zasiahnuté stanoviská: ${alert.affectedHivesCount} (${Number(alert.affectedColonies) || 0} rodín)`
        : '';
      detail.textContent = [alert.locationLabel || alert.location || '', impact].filter(Boolean).join(' • ');

      const meta = document.createElement('div');
      meta.className = 'text-slate-500';
      const recipients = Array.isArray(alert.recipients) && alert.recipients.length
        ? `Príjemcovia: ${alert.recipients.join(', ')}`
        : '';
      meta.textContent = [alert.senderName || '', recipients].filter(Boolean).join(' • ');

      item.append(head, detail, meta);
      alertsTable.appendChild(item);
    });
  }
}

function focusLpisParcelOnMap(parcelId) {
  const parcel = store.getState().lpisParcels.find((p) => p.id === parcelId);
  if (!parcel) return;
  closeUserDashboardModal();
  if (!appMapEngine?.map) return;
  if (Array.isArray(parcel.center) && parcel.center.length === 2) {
    appMapEngine.map.setView(parcel.center, 14);
  }
  if (store.getState().isLpisLayerVisible) {
    appMapEngine.renderLpisParcels(parcel.ownerIco);
  }
  showToast(`Parcela ${parcel.id} je zobrazená na mape`, 'info');
}

function focusHiveOnMap(hiveId) {
  const hive = (store.getState().hives || []).find((h) => String(h.id) === String(hiveId));
  if (!hive) return;
  closeUserDashboardModal();
  if (appMapEngine?.map && Number.isFinite(Number(hive.lat)) && Number.isFinite(Number(hive.lng))) {
    appMapEngine.map.setView([Number(hive.lat), Number(hive.lng)], 14);
    appMapEngine.renderAllHives();
  }
}

function geoJsonPolygonToLeaflet(geometry) {
  const ring = geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const coords = ring
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => [Number(lat), Number(lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return coords.length >= 4 ? coords : null;
}

async function syncLpisParcelsFromApi() {
  const currentUser = getCurrentUserSafe();
  if (!currentUser?.lpisId || !['AGRO', 'AGRO_PRO'].includes(currentUser.role)) return;
  if (!localStorage.getItem('agrogis_api_token_v1')) return;

  let apiParcels;
  try {
    apiParcels = await backendApi.getLpisParcels(currentUser.lpisId);
  } catch (error) {
    if (!backendApi.isUnavailable(error)) {
      console.warn('[AGROGIS] LPIS lookup failed:', error);
    }
    return;
  }

  const mapped = apiParcels
    .map((parcel) => {
      const coords = geoJsonPolygonToLeaflet(parcel.geometry);
      if (!coords || !parcel.externalRegisterId) return null;
      const center = [
        coords.reduce((sum, point) => sum + point[0], 0) / coords.length,
        coords.reduce((sum, point) => sum + point[1], 0) / coords.length
      ];
      return {
        id: parcel.externalRegisterId,
        ownerIco: currentUser.ico || '',
        ownerName: currentUser.companyName || currentUser.name || '',
        kUzemie: '',
        crop: parcel.crop || 'Neurčená plodina',
        areaHa: Number(parcel.areaHa || 0),
        kultura: 'LPIS register',
        center,
        coords
      };
    })
    .filter(Boolean);

  if (!mapped.length) return;
  const existing = store.getState().lpisParcels;
  const knownIds = new Set(mapped.map((p) => p.id));
  store.setState({ lpisParcels: [...existing.filter((p) => p.ownerIco !== currentUser.ico || !knownIds.has(p.id)), ...mapped] });
  if (appMapEngine) appMapEngine.renderLpisParcels();
  refreshDashboardStats();
}

const professionalRegisterRoles = new Set(['AGRO', 'AGRO_PRO', 'BEEKEEPER']);
const communityRegisterRoles = new Set(['BEE_HOBBY', 'BEE_BEGINNER', 'GARDENER', 'GARDEN_NEW']);

function updateRegisterRoleFields(role) {
  const nameLabel = $('reg-name-label');
  const label = $('reg-code-label');
  const input = $('reg-ico');
  const professionalBlock = $('reg-professional-block');
  const communityBlock = $('reg-community-block');
  const lpisBlock = $('reg-lpis-block');
  const addressWrap = $('reg-address-wrap');
  const companySearch = $('reg-company-search');
  const companySuggestions = $('reg-company-suggestions');
  const communityTitle = $('reg-community-title');
  const communityHelp = $('reg-community-help');

  const isProfessional = professionalRegisterRoles.has(role);
  const isCommunity = communityRegisterRoles.has(role);

  if (professionalBlock) professionalBlock.classList.toggle('hidden', !isProfessional);
  if (communityBlock) communityBlock.classList.toggle('hidden', !isCommunity);
  if (lpisBlock) lpisBlock.classList.toggle('hidden', role !== 'AGRO' && role !== 'AGRO_PRO');
  if (addressWrap) addressWrap.classList.toggle('hidden', !isProfessional && !isCommunity ? false : isProfessional && role === 'BEEKEEPER' ? false : false);

  if (companySearch) {
    companySearch.placeholder = role === 'BEEKEEPER' ? 'napr. Včelárska spoločnosť / CEVZ' : 'napr. PD Devio / 00190225';
  }

  if (nameLabel) {
    if (role === 'AGRO' || role === 'AGRO_PRO') {
      nameLabel.textContent = 'Názov farmy / podnik *';
    } else if (role === 'BEEKEEPER') {
      nameLabel.textContent = 'Názov včelárskeho podniku / usadlosti *';
    } else {
      nameLabel.textContent = 'Meno alebo prezývka *';
    }
  }

  if (label && input) {
    if (role === 'BEEKEEPER') {
      label.textContent = 'CEVZ / registračný kód';
      input.placeholder = 'napr. CEVZ-BA-0142';
      if (!input.value) input.value = 'CEVZ-BA-0142';
    } else if (role === 'AGRO' || role === 'AGRO_PRO') {
      label.textContent = 'IČO subjektu';
      input.placeholder = 'napr. 00190225';
    } else {
      label.textContent = 'IČO / identifikátor (voliteľné)';
      input.placeholder = 'napr. 00190225';
    }
  }

  if (communityTitle) {
    const titles = {
      BEE_HOBBY: 'Vyznačte na mape, kde máte svoje úle.',
      BEE_BEGINNER: 'Vyznačte na mape, kde plánujete mať svoje úle.',
      GARDENER: 'Kde sa nachádza vaša záhrada?',
      GARDEN_NEW: 'Kde sa nachádza vaša záhrada alebo záhon?'
    };
    communityTitle.textContent = titles[role] || 'Vyberte svoju lokalitu';
  }

  if (communityHelp) {
    const hints = {
      BEE_HOBBY: 'Vďaka tomuto bodu môže systém včas varovať o plánovanom postreku v okruhu 3 km od vašej lokality.',
      BEE_BEGINNER: 'Tento bod pomôže systému upozorniť vás na predpokladaný postrek v okruhu 3 km od vašich úľov.',
      GARDENER: 'Pridaním svojej záhrady sa môžete zapojiť do siete Bonusových darov a vidieť, kde sa v okolí nachádzajú včely.',
      GARDEN_NEW: 'Aj malá záhrada môže pomôcť ochrane biodiverzity — včely, kompost a biopásy začínajú práve tu.'
    };
    communityHelp.textContent = hints[role] || 'Vďaka tejto lokalite budete dostávať relevantné upozornenia o vašom okolí.';
  }

  if (companySuggestions) companySuggestions.classList.add('hidden');
  const pin = $('reg-location-pin');
  if (pin) pin.classList.add('hidden');
  const lat = $('reg-location-lat');
  const lng = $('reg-location-lng');
  if (lat) lat.value = '';
  if (lng) lng.value = '';
}

function renderCompanySuggestions(query = '') {
  const suggestions = $('reg-company-suggestions');
  const input = $('reg-company-search');
  if (!suggestions || !input) return;

  const value = String(query || '').trim();
  if (!value) {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    return;
  }

  const state = store.getState();
  const normalized = normalizeQuery(value);
  const hits = [...(state.entities || [])]
    .filter((entity) => {
      const ico = normalizeQuery(entity.ico || '');
      const name = normalizeQuery(entity.name || '');
      const city = normalizeQuery(entity.city || '');
      const address = normalizeQuery(entity.address || '');
      return ico.includes(normalized) || name.includes(normalized) || city.includes(normalized) || address.includes(normalized);
    })
    .slice(0, 5);

  if (!hits.length) {
    suggestions.innerHTML = '<div class="px-2 py-2 text-[11px] text-slate-500">Nenašli sa žiadne oficiálne subjekty.</div>';
    suggestions.classList.remove('hidden');
    return;
  }

  suggestions.innerHTML = hits.map((entity) => `
    <button type="button" class="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-left transition hover:bg-emerald-100" data-entity-ico="${entity.ico || ''}" data-entity-name="${escapeHtml(entity.name || '')}" data-entity-address="${escapeHtml(entity.address || '')}">
      <div class="font-bold text-slate-900">${escapeHtml(entity.name || 'Neznámy subjekt')}</div>
      <div class="mt-0.5 text-[10px] text-slate-600">${escapeHtml(entity.ico || 'IČO neznáme')} · ${escapeHtml(entity.city || entity.address || 'Sídlo neuvedené')}</div>
    </button>
  `).join('');

  suggestions.querySelectorAll('[data-entity-ico]').forEach((button) => {
    button.addEventListener('click', () => {
      const nameInput = $('reg-name');
      const addressInput = $('reg-address');
      const icoInput = $('reg-ico');
      const searchValue = button.getAttribute('data-entity-name') || '';
      const addressValue = button.getAttribute('data-entity-address') || '';
      const icoValue = button.getAttribute('data-entity-ico') || '';

      if (nameInput) nameInput.value = searchValue;
      if (addressInput) addressInput.value = addressValue;
      if (icoInput) icoInput.value = icoValue;
      if (input) input.value = searchValue;
      suggestions.classList.add('hidden');
      showToast(`Vybraný subjekt: ${searchValue}`, 'success');
    });
  });

  suggestions.classList.remove('hidden');
}

function handleCommunityMapClick(event) {
  const surface = $('reg-map-surface');
  const pin = $('reg-location-pin');
  const latInput = $('reg-location-lat');
  const lngInput = $('reg-location-lng');
  if (!surface || !pin || !latInput || !lngInput) return;

  const rect = surface.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 14), rect.width - 14);
  const y = Math.min(Math.max(event.clientY - rect.top, 14), rect.height - 14);

  pin.style.left = `${x}px`;
  pin.style.top = `${y}px`;
  pin.classList.remove('hidden');

  const lat = 48.6 - (y / rect.height) * 0.9;
  const lng = 17.0 + (x / rect.width) * 1.2;
  latInput.value = String(lat.toFixed(5));
  lngInput.value = String(lng.toFixed(5));
}

function autofillRegistrationFromICO() {
  const value = $('reg-ico')?.value?.trim();
  if (!value) {
    showToast('Zadajte najprv IČO pre automatické doplnenie údajov', 'warning');
    return;
  }

  const match = store.getState().entities.find((entity) => normalizeQuery(entity.ico) === normalizeQuery(value));
  if (!match) {
    showToast('IČO nebolo nájdené v lokálnom registri', 'warning');
    return;
  }

  const nameInput = $('reg-name');
  const addressInput = $('reg-address');
  if (nameInput) nameInput.value = match.name;
  if (addressInput) addressInput.value = match.address;
  const companySearch = $('reg-company-search');
  if (companySearch) companySearch.value = match.name;

  showToast(`Údaje pre ${match.name} boli doplnené automaticky`, 'success');
}

function quickDemoLogin(email, password) {
  const users = getStoredUsers();
  const match = users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.passwordHash === password);
  if (!match) {
    showToast('Demo účet nebol nájdený', 'warning');
    return;
  }

  const safeUser = sanitizeUser(match);
  store.setState({ currentUser: safeUser });
  syncAuthUi();
  closeAuthModal();
  closeLandingPortal();
  showToast(`Prihlásený demo používateľ: ${safeUser.name}`, 'success');
}

async function submitLoginForm(event) {
  event.preventDefault();
  const email = $('login-email')?.value?.trim() || '';
  const password = $('login-password')?.value || '';

  if (!email || !password) {
    showToast('Vyplňte e-mail a heslo', 'warning');
    return;
  }

  try {
    const user = await backendApi.login(email, password);
    store.setState({ currentUser: user });
    syncAuthUi();
    closeAuthModal();
    closeLandingPortal();
    showToast(`Vitajte, ${user.name}`, 'success');
    return;
  } catch (error) {
    if (!backendApi.isUnavailable(error)) {
      showToast(error.status === 401 ? 'Nesprávny e-mail alebo heslo' : error.message, 'warning');
      return;
    }
  }

  const localUser = getStoredUsers().find((user) => user.email.toLowerCase() === email.toLowerCase() && user.passwordHash === password);
  if (!localUser) {
    showToast('Backend nie je dostupný a lokálny účet sa nenašiel', 'warning');
    return;
  }

  const safeUser = sanitizeUser(localUser);
  store.setState({ currentUser: safeUser });
  syncAuthUi();
  closeAuthModal();
  closeLandingPortal();
  showToast(`Vitajte, ${safeUser.name} (lokálny režim)`, 'info');
}

async function submitRegisterForm(event) {
  event.preventDefault();

  const roleInput = document.querySelector('input[name="reg-role"]:checked');
  const role = roleInput ? roleInput.value : 'AGRO';
  const name = $('reg-name')?.value?.trim() || '';
  const email = $('reg-email')?.value?.trim() || '';
  const password = $('reg-password')?.value || '';
  const ico = $('reg-ico')?.value?.trim() || '';
  const phone = $('reg-phone')?.value?.trim() || '';
  const address = $('reg-address')?.value?.trim() || '';

  if (!name || !email || !password) {
    showToast('Vyplňte povinné polia pre registráciu', 'warning');
    return;
  }

  const lpisId = $('reg-lpis-id')?.value?.trim() || '';
  const locationLat = $('reg-location-lat')?.value?.trim() || '';
  const locationLng = $('reg-location-lng')?.value?.trim() || '';
  const companySearch = $('reg-company-search')?.value?.trim() || '';
  const isProfessionalRole = professionalRegisterRoles.has(role);
  const isCommunityRole = communityRegisterRoles.has(role);
  const normalizedRole = role;

  const request = {
    role: normalizedRole,
    name,
    email,
    password,
    ico: isProfessionalRole ? ico : '',
    cevz: role === 'BEEKEEPER' ? (ico || '') : '',
    phone,
    address,
    lpisId: role === 'AGRO' || role === 'AGRO_PRO' ? lpisId : '',
    profileLocation: isCommunityRole && locationLat && locationLng ? { lat: Number(locationLat), lng: Number(locationLng) } : null,
    companySearch: isProfessionalRole ? companySearch || name : ''
  };

  try {
    const user = await backendApi.register(request);
    store.setState({ currentUser: user });
    syncAuthUi();
    closeAuthModal();
    closeLandingPortal();
    showToast('Účet bol vytvorený v databáze', 'success');
    return;
  } catch (error) {
    if (!backendApi.isUnavailable(error)) {
      showToast(error.code === 'EMAIL_ALREADY_EXISTS' ? 'Účet s týmto e-mailom už existuje' : error.message, 'warning');
      return;
    }
  }

  const users = getStoredUsers();
  const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    showToast('Účet s týmto e-mailom už existuje', 'warning');
    return;
  }

  const newUser = {
    id: `usr-${Date.now()}`,
    role: normalizedRole,
    name,
    email: email.toLowerCase(),
    passwordHash: password,
    ico: isProfessionalRole ? (ico || '') : '',
    cevz: role === 'BEEKEEPER' ? (ico || `CEVZ-SK-${Math.floor(1000 + Math.random() * 9000)}`) : '',
    phone,
    address,
    lpisId: role === 'AGRO' || role === 'AGRO_PRO' ? lpisId : '',
    profileLocation: isCommunityRole && locationLat && locationLng ? { lat: Number(locationLat), lng: Number(locationLng) } : null,
    companyName: isProfessionalRole ? companySearch || name : '',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveStoredUsers(users);
  store.setState({ currentUser: sanitizeUser(newUser) });
  syncAuthUi();
  closeAuthModal();
  closeLandingPortal();
  showToast('Registrácia bola uložená lokálne (backend nie je dostupný)', 'info');
}

function switchDashboardSection(tabName) {
  const sections = ['overview', 'alerts', 'profile'];
  sections.forEach((tab) => {
    const btn = document.getElementById(`dash-tab-btn-${tab}`);
    const section = document.getElementById(`dash-sec-${tab}`);
    if (btn) {
      const isActive = tab === tabName;
      btn.classList.toggle('border-emerald-600', isActive);
      btn.classList.toggle('text-emerald-700', isActive);
      btn.classList.toggle('border-transparent', !isActive);
      btn.classList.toggle('text-slate-500', !isActive);
    }
    if (section) section.classList.toggle('hidden', tab !== tabName);
  });
}

async function saveUserProfileChanges(event) {
  event.preventDefault();
  const currentUser = getCurrentUserSafe();
  if (!currentUser) {
    showToast('Najprv sa prihláste do účtu', 'warning');
    return;
  }

  const name = document.getElementById('prof-name')?.value?.trim() || currentUser.name || '';
  const ico = document.getElementById('prof-ico')?.value?.trim() || currentUser.ico || '';
  const phone = document.getElementById('prof-phone')?.value?.trim() || currentUser.phone || '';
  const address = document.getElementById('prof-address')?.value?.trim() || currentUser.address || '';
  const companyName = document.getElementById('prof-company')?.value?.trim() || currentUser.companyName || name;
  const lpisId = document.getElementById('prof-lpis-id')?.value?.trim() || currentUser.lpisId || '';
  const profileLocation = currentUser.profileLocation && Number.isFinite(currentUser.profileLocation.lat) && Number.isFinite(currentUser.profileLocation.lng)
    ? { lat: Number(currentUser.profileLocation.lat), lng: Number(currentUser.profileLocation.lng) }
    : null;

  const users = getStoredUsers();
  const idx = users.findIndex((u) => u.email.toLowerCase() === currentUser.email.toLowerCase());
  const nextUser = {
    ...currentUser,
    name,
    ico: currentUser.role === 'BEEKEEPER' ? (currentUser.cevz || ico) : ico,
    cevz: currentUser.role === 'BEEKEEPER' ? (ico || currentUser.cevz || '') : currentUser.cevz,
    phone,
    address,
    companyName,
    lpisId,
    profileLocation
  };

  if (idx >= 0) {
    users[idx] = {
      ...users[idx],
      name,
      ico: currentUser.role === 'BEEKEEPER' ? (users[idx].cevz || ico) : ico,
      cevz: currentUser.role === 'BEEKEEPER' ? (ico || users[idx].cevz) : users[idx].cevz,
      phone,
      address,
      companyName,
      lpisId,
      profileLocation
    };
    saveStoredUsers(users);
  }

  try {
    const updatedFromServer = await backendApi.updateCurrentUser({
      name,
      phone,
      address,
      lpisId,
      companyName,
      profileLocation
    });
    if (updatedFromServer) {
      store.setState({ currentUser: { ...nextUser, ...updatedFromServer, email: updatedFromServer.email || currentUser.email } });
      syncAuthUi();
      showToast('Profil bol uložený', 'success');
      return;
    }
  } catch (error) {
    console.warn('[AGROGIS] backend profile update failed, using local fallback:', error);
  }

  store.setState({ currentUser: nextUser });
  syncAuthUi();
  showToast('Profil bol uložený lokálne', 'success');
}

async function deleteUserProfile() {
  const currentUser = getCurrentUserSafe();
  if (!currentUser) {
    showToast('Najprv sa prihláste do účtu', 'warning');
    return;
  }

  const confirmed = window.confirm('Naozaj chcete zmazať tento účet? Táto akcia je nevratná.');
  if (!confirmed) return;

  try {
    await backendApi.deleteCurrentUser();
  } catch (error) {
    console.warn('[AGROGIS] backend delete failed, continuing with local cleanup:', error);
  }

  const users = getStoredUsers().filter((user) => user.email.toLowerCase() !== currentUser.email.toLowerCase());
  saveStoredUsers(users);
  store.setState({ currentUser: null });
  syncAuthUi();
  closeUserDashboardModal();
  showToast('Účet bol odstránený', 'info');
}

function toggleLpisLayer(checked) {
  store.setState({ isLpisLayerVisible: checked });
}

function toggleHivesLayer(checked) {
  store.setState({ isHivesLayerVisible: checked });
}

function toggleHiveRadiiLayer(checked) {
  store.setState({ isHiveRadiiVisible: checked });
}

function toggleKatasterLayer(checked) {
  store.setState({ isKatasterVisible: checked });
}

function toggleDmrLayer(checked) {
  store.setState({ isDmrVisible: checked });
}

function setLayerOpacity(layerType, value) {
  const numeric = Number(value);
  if (layerType === 'lpis') {
    store.setState({ lpisOpacity: numeric / 100 });
    const label = document.getElementById('val-op-lpis');
    if (label) label.textContent = `${numeric}%`;
  }
  if (layerType === 'kataster') {
    const label = document.getElementById('val-op-kataster');
    if (label) label.textContent = `${numeric}%`;
  }
  if (layerType === 'dmr') {
    const label = document.getElementById('val-op-dmr');
    if (label) label.textContent = `${numeric}%`;
  }
  if (appMapEngine) appMapEngine.setLayerOpacity(layerType, numeric);
}

function openHiveModal(lat, lng) {
  pendingHiveCoordinates = { lat, lng };
  const modal = $('hive-modal');
  const coords = $('modal-hive-coords');
  if (modal) modal.classList.remove('hidden');
  if (coords) coords.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function closeHiveModal() {
  const modal = $('hive-modal');
  if (modal) modal.classList.add('hidden');
  pendingHiveCoordinates = null;
}

function confirmAddHive() {
  const nameInput = $('modal-hive-name');
  const countInput = $('modal-hive-count');
  const cevzInput = $('modal-hive-cevz');
  const emailInput = $('modal-hive-email');

  if (!pendingHiveCoordinates || !nameInput || !countInput || !emailInput) {
    showToast('Najprv vyberte miesto v mape', 'warning');
    return;
  }

  const hive = {
    id: Date.now(),
    name: nameInput.value.trim() || 'Nové stanovište',
    count: Number(countInput.value) || 1,
    email: emailInput.value.trim() || 'n/a',
    cevz: cevzInput?.value?.trim() || 'CEVZ-SK-2026',
    lat: pendingHiveCoordinates.lat,
    lng: pendingHiveCoordinates.lng
  };

  const state = store.getState();
  const updatedHives = [...state.hives, hive];
  store.setState({ hives: updatedHives });
  closeHiveModal();
  if (appMapEngine) appMapEngine.renderAllHives();
  showToast('Včelstvo bolo pridané do mapy', 'success');

  if (getCurrentUserSafe() && localStorage.getItem('agrogis_api_token_v1')) {
    backendApi.saveHive(hive)
      .then((hiveId) => {
        if (!hiveId) return;
        const withServerId = (store.getState().hives || []).map((h) => (h.id === hive.id ? { ...h, serverId: hiveId } : h));
        store.setState({ hives: withServerId });
      })
      .catch((error) => {
        if (!backendApi.isUnavailable(error)) console.warn('[AGROGIS] hive sync failed:', error);
      });
  }
}

function focusUserAssetsOnMap() {
  const currentUser = getCurrentUserSafe();
  if (!currentUser) {
    showToast('Najprv sa prihláste', 'warning');
    return;
  }

  const match = store.getState().entities.find((entity) => normalizeQuery(entity.ico) === normalizeQuery(currentUser.ico || '') || entity.name === currentUser.name);
  if (match && appMapEngine) {
    appMapEngine.renderCompanyMarker(match.lat, match.lng, match.name, match.ico, match.address);
    return;
  }

  if (appMapEngine && appMapEngine.map) {
    appMapEngine.map.setView([48.35, 17.75], 9);
  }
}

function printInspectionReport() {
  window.print();
  showToast('Protokol bol pripravený na tlač', 'info');
}

function exportGeoJSON() {
  const state = store.getState();
  const payload = {
    type: 'FeatureCollection',
    features: state.lpisParcels.map((parcel) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [parcel.coords.map(([lat, lng]) => [lng, lat])]
      },
      properties: {
        id: parcel.id,
        ownerIco: parcel.ownerIco,
        ownerName: parcel.ownerName,
        crop: parcel.crop
      }
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'agrogis-lpis-export.geojson';
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('GeoJSON export bol vygenerovaný', 'success');
}

function triggerSprayAlertEmails(lat, lng, collisionsCount, totalColonies) {
  const report = store.getState().lastCollisionReport;
  const currentUser = getCurrentUserSafe();
  const recipients = Array.isArray(report?.collisions)
    ? report.collisions.map((c) => c.hive_email || c.hive_name).filter(Boolean)
    : [];

  store.addSprayAlert({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    timestamp: new Date().toLocaleString('sk-SK'),
    type: 'SPRAY_ALERT',
    title: 'Hlásenie postreku',
    senderName: currentUser ? `${currentUser.name}${currentUser.ico ? ` (IČO: ${currentUser.ico})` : ''}` : 'Neprihlásený používateľ',
    senderEmail: currentUser?.email || '',
    locationLabel: report?.contextLabel || `Súradnice ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`,
    lat: Number(lat),
    lng: Number(lng),
    affectedHivesCount: collisionsCount,
    affectedColonies: totalColonies,
    recipients,
    note: 'Notifikácie odoslané včelárom v 3 km ochrannom pásme.'
  });

  if (currentUser && localStorage.getItem('agrogis_api_token_v1')) {
    backendApi.reportSprayAlert({
      lat: Number(lat),
      lng: Number(lng),
      locationLabel: report?.contextLabel || '',
      note: `Zasiahnuté stanoviská: ${collisionsCount} (${totalColonies} rodín)`
    }).catch((error) => {
      if (!backendApi.isUnavailable(error)) console.warn('[AGROGIS] spray alert sync failed:', error);
    });
  }

  refreshDashboardStats();
  showToast(`Odoslané výstrahy pre ${collisionsCount} stanovíšť (${totalColonies} rodín)`, 'info');
}

function initUi() {
  // Prednastaví východziu perzónu pre appku na pozadí, ale NEZATVÁRA úvodnú obrazovku —
  // tá musí ostať prvým, čo používateľ uvidí (srdcom je mapa a posolstvo o ochrane včiel).
  appState.activePersona = 'AGRO_PRO';
  store.setState({ currentPersona: 'AGRO_PRO' });
  updatePersonaUi('AGRO_PRO');
  switchSidebarTab('search');
  switchAuthModalTab('login');
  setBaseMap('ortho');
  syncAuthUi();
  refreshDashboardStats();
  if (localStorage.getItem('agrogis_api_token_v1')) {
    backendApi.getCurrentUser().then((user) => {
      if (user) {
        store.setState({ currentUser: user });
        syncAuthUi();
      }
    }).catch(() => backendApi.logout());
  }

  const authModal = $('auth-modal');
  const userDashboardModal = $('user-dashboard-modal');
  if (authModal) authModal.classList.add('hidden');
  if (userDashboardModal) userDashboardModal.classList.add('hidden');

  const closeButtons = document.querySelectorAll('[data-close-modal]');
  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const modal = button.closest('[id$="-modal"]');
      if (modal) modal.classList.add('hidden');
    });
  });
}

function initMapApp() {
  if (!appMapEngine) {
    appMapEngine = new AgroMapEngine('map', null, false);
    window.agrogisMap = appMapEngine;
  }
}

function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.warn('[AGROGIS] Service worker registration failed:', error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  registerAppServiceWorker();
  initUi();
  initMapApp();
  if (window.L && appMapEngine) {
    appMapEngine.map.invalidateSize();
  }
});

window.selectUserPersona = selectUserPersona;
window.openLandingPortal = openLandingPortal;
window.closeLandingPortal = closeLandingPortal;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthModalTab = switchAuthModalTab;
window.submitLoginForm = submitLoginForm;
window.submitRegisterForm = submitRegisterForm;
window.quickDemoLogin = quickDemoLogin;
window.autofillRegistrationFromICO = autofillRegistrationFromICO;
window.updateRegisterRoleFields = updateRegisterRoleFields;
window.renderCompanySuggestions = renderCompanySuggestions;
window.handleCommunityMapClick = handleCommunityMapClick;
window.toggleLeftSidebar = toggleLeftSidebar;
window.switchSidebarTab = switchSidebarTab;
window.handleLogoutUser = handleLogoutUser;
window.openUserDashboardModal = openUserDashboardModal;
window.closeUserDashboardModal = closeUserDashboardModal;
window.toggleSpraySimulation = toggleSpraySimulation;
window.toggleAddHiveMode = toggleAddHiveMode;
window.toggleDrawPolygonMode = toggleDrawPolygonMode;
window.toggleIdentifyMode = toggleIdentifyMode;
window.toggleMeasureMode = toggleMeasureMode;
window.finishPolygonDrawing = finishPolygonDrawing;
window.cancelActiveModes = cancelActiveModes;
window.clearAllMapAnalyses = clearAllMapAnalyses;
window.locateUserGPS = locateUserGPS;
window.resetSlovakiaView = resetSlovakiaView;
window.setBaseMap = setBaseMap;
window.quickToggleKatasterButton = quickToggleKatasterButton;
window.quickSelectICO = quickSelectICO;
window.handleEntityVerification = handleEntityVerification;
window.clearSearchInput = clearSearchInput;
window.selectCadastreRegister = selectCadastreRegister;
window.quickSearchParcel = quickSearchParcel;
window.handleCadastreParcelSearch = handleCadastreParcelSearch;
window.toggleLpisLayer = toggleLpisLayer;
window.toggleHivesLayer = toggleHivesLayer;
window.toggleHiveRadiiLayer = toggleHiveRadiiLayer;
window.toggleKatasterLayer = toggleKatasterLayer;
window.toggleDmrLayer = toggleDmrLayer;
window.setLayerOpacity = setLayerOpacity;
window.switchDashboardSection = switchDashboardSection;
window.saveUserProfileChanges = saveUserProfileChanges;
window.deleteUserProfile = deleteUserProfile;
window.populateProfileForm = populateProfileForm;
window.focusLpisParcelOnMap = focusLpisParcelOnMap;
window.focusHiveOnMap = focusHiveOnMap;
window.focusUserAssetsOnMap = focusUserAssetsOnMap;
window.openHiveModal = openHiveModal;
window.closeHiveModal = closeHiveModal;
window.confirmAddHive = confirmAddHive;
window.printInspectionReport = printInspectionReport;
window.exportGeoJSON = exportGeoJSON;
window.triggerSprayAlertEmails = triggerSprayAlertEmails;
window.updatePersonaUi = updatePersonaUi;
window.showToast = showToast;
window.appMapEngine = () => appMapEngine;
window.store = store;

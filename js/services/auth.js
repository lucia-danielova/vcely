/**
 * @file auth.js
 * @description Autentifikačný modul (Supabase Auth + Lokálna databáza účtov).
 */

import { store } from '../core/state-store.js';

const USERS_STORAGE_KEY = 'agrogis_registered_users_v4';

const DEFAULT_DEMO_USERS = [
    {
        id: 'usr-demo-agro-1',
        role: 'AGRO',
        name: 'PD Devio Nové Sady (Ing. Martin Kráľ)',
        email: 'agronom@pddevio.sk',
        passwordHash: 'Agro2026!',
        ico: '00190225',
        cevz: '',
        phone: '+421 905 412 880',
        address: 'Nové Sady 186, 951 24 Nové Sady',
        createdAt: '2026-01-15T08:00:00.000Z'
    },
    {
        id: 'usr-demo-bee-1',
        role: 'BEEKEEPER',
        name: 'Včelnica Kráľová pri Senci (Jozef Včelár)',
        email: 'kralova@vcelari-senec.sk',
        passwordHash: 'Vcela2026!',
        ico: '',
        cevz: 'CEVZ-BA-0142',
        phone: '+421 911 228 910',
        address: 'Kráľová pri Senci 42, 900 50 Kráľová pri Senci',
        createdAt: '2026-02-10T10:30:00.000Z'
    }
];

export class AgroAuthService {
    constructor(supabaseClient = null, isCloudConfigured = false) {
        this.supabase = supabaseClient;
        this.isCloudConfigured = isCloudConfigured;
        this._ensureLocalUsersInitialized();
    }

    _ensureLocalUsersInitialized() {
        const raw = localStorage.getItem(USERS_STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_DEMO_USERS));
        }
    }

    _getLocalUsers() {
        try {
            return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY)) || DEFAULT_DEMO_USERS;
        } catch {
            return DEFAULT_DEMO_USERS;
        }
    }

    _saveLocalUsers(users) {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }

    async registerUser({ role, name, email, password, ico, phone, address }) {
        const cleanEmail = email.trim().toLowerCase();
        const cleanRole = ['AGRO', 'BEEKEEPER'].includes(role) ? role : 'AGRO';
        const cleanCode = (ico || '').trim();

        if (this.isCloudConfigured && this.supabase) {
            try {
                await this.supabase.auth.signUp({
                    email: cleanEmail,
                    password,
                    options: {
                        data: {
                            role: cleanRole,
                            name: name.trim(),
                            ico: cleanRole === 'BEEKEEPER' ? '' : cleanCode,
                            cevz: cleanRole === 'BEEKEEPER' ? (cleanCode || 'CEVZ-SK-2026') : '',
                            phone: (phone || '').trim(),
                            address: (address || '').trim()
                        }
                    }
                });
            } catch (cloudErr) {}
        }

        const users = this._getLocalUsers();
        const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
        if (existing) {
            throw new Error(`Účet s e-mailom "${cleanEmail}" už existuje. Prihláste sa.`);
        }

        const newUser = {
            id: `usr-${Date.now()}`,
            role: cleanRole,
            name: name.trim(),
            email: cleanEmail,
            passwordHash: password,
            ico: cleanRole === 'BEEKEEPER' ? '' : cleanCode,
            cevz: cleanRole === 'BEEKEEPER' ? (cleanCode || `CEVZ-SK-${Math.floor(1000 + Math.random() * 9000)}`) : '',
            phone: (phone || '').trim() || '+421 900 000 000',
            address: (address || '').trim() || 'Slovenská republika',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        this._saveLocalUsers(users);

        const sessionUser = this._sanitizeUser(newUser);
        store.setState({ currentUser: sessionUser });
        return sessionUser;
    }

    async loginUser(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const users = this._getLocalUsers();
        const matched = users.find(
            u => u.email.toLowerCase() === cleanEmail && u.passwordHash === password
        );

        if (matched) {
            const sessionUser = this._sanitizeUser(matched);
            store.setState({ currentUser: sessionUser });
            return sessionUser;
        }

        if (this.isCloudConfigured && this.supabase) {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: cleanEmail,
                password
            });
            if (error) throw new Error('Nesprávny e-mail alebo heslo.');
            if (data && data.user) {
                const meta = data.user.user_metadata || {};
                const sessionUser = {
                    id: data.user.id,
                    role: meta.role || 'AGRO',
                    name: meta.name || cleanEmail,
                    email: cleanEmail,
                    ico: meta.ico || '',
                    cevz: meta.cevz || '',
                    phone: meta.phone || '',
                    address: meta.address || 'Slovensko'
                };
                store.setState({ currentUser: sessionUser });
                return sessionUser;
            }
        }

        throw new Error('Nesprávny e-mail alebo heslo.');
    }

    updateUserProfile(updates) {
        const current = store.getState().currentUser;
        if (!current) return null;

        const users = this._getLocalUsers();
        const idx = users.findIndex(u => u.email.toLowerCase() === current.email.toLowerCase());

        const updatedUser = {
            ...current,
            name: updates.name || current.name,
            ico: current.role === 'BEEKEEPER' ? current.ico : (updates.code ?? current.ico),
            cevz: current.role === 'BEEKEEPER' ? (updates.code ?? current.cevz) : current.cevz,
            phone: updates.phone ?? current.phone,
            address: updates.address ?? current.address
        };

        if (idx >= 0) {
            users[idx] = { ...users[idx], ...updatedUser };
            this._saveLocalUsers(users);
        }

        store.setState({ currentUser: updatedUser });
        return updatedUser;
    }

    async logoutUser() {
        if (this.isCloudConfigured && this.supabase) {
            try { await this.supabase.auth.signOut(); } catch (e) {}
        }
        store.setState({ currentUser: null });
    }

    _sanitizeUser(userObj) {
        const { passwordHash, ...safeUser } = userObj;
        return safeUser;
    }
}
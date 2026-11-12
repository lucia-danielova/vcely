/**
 * @file state-store.js
 * @description Centralizovaný reaktívny State Store pre AGROGIS SLOVENSKO (ZBGIS, Kataster, LPIS, CEVZ, Účty).
 */

const LEGACY_DEMO_HIVES = [
    { id: 101, name: 'Včelnica Kráľová pri Senci (Múzeum)', count: 48, email: 'kralova@vcelari-senec.sk', cevz: 'CEVZ-BA-0142', lat: 48.1905, lng: 17.4285 },
    { id: 102, name: 'Stanovište Nové Sady - Šabata', count: 35, email: 'vcelar.novesady@agromail.sk', cevz: 'CEVZ-NR-0881', lat: 48.4182, lng: 17.9912 },
    { id: 103, name: 'Včelárska farma Dolná Krupá', count: 62, email: 'medovina@dolnakrupa.sk', cevz: 'CEVZ-TT-0319', lat: 48.4845, lng: 17.5512 },
    { id: 104, name: 'EkoVčely Petržalka - Janíkov dvor', count: 18, email: 'petrzalka@mestskovcelarstvo.sk', cevz: 'CEVZ-BA-0911', lat: 48.0965, lng: 17.1142 },
    { id: 105, name: 'Lesná včelnica Červený Kameň', count: 40, email: 'bielekarpaty@vcelarstvo.sk', cevz: 'CEVZ-TN-0445', lat: 49.0861, lng: 18.1884 },
    { id: 106, name: 'Agátová paša Hurbanovo - Konkoly', count: 85, email: 'juh@vcelari-komarno.sk', cevz: 'CEVZ-KN-1120', lat: 47.8741, lng: 18.1982 },
    { id: 107, name: 'Včelnica Podpoľanie - Detva', count: 29, email: 'detva@horskevcelarstvo.sk', cevz: 'CEVZ-ZV-0512', lat: 48.5610, lng: 19.4185 }
];

const LEGACY_DEMO_ENTITIES = [
    { ico: '00190225', name: 'PD Devio Nové Sady', type: 'Poľnohospodárske družstvo', address: 'Nové Sady 186, 951 24 Nové Sady', city: 'Nové Sady', lat: 48.4126, lng: 17.9839 },
    { ico: '31322832', name: 'Poľnohospodárske družstvo Senec', type: 'Poľnohospodárske družstvo', address: 'Bratislavská 12, 903 01 Senec', city: 'Senec', lat: 48.2194, lng: 17.3997 },
    { ico: '00189456', name: 'AGROFARMA Dolná Krupá, a.s.', type: 'Akciová spoločnosť', address: 'Hlavná 45, 919 65 Dolná Krupá', city: 'Dolná Krupá', lat: 48.4819, lng: 17.5468 },
    { ico: '36012459', name: 'Agrokomplex Hurbanovo, s.r.o.', type: 'Spoločnosť s r. o.', address: 'Komárňanská 88, 947 01 Hurbanovo', city: 'Hurbanovo', lat: 47.8698, lng: 18.1923 },
    { ico: '17315891', name: 'Rulc Agro - Petržalské sady', type: 'Samostatne hospodáriaci roľník', address: 'Panónska cesta 34, 851 04 Bratislava - Petržalka', city: 'Bratislava', lat: 48.1045, lng: 17.1088 },
    { ico: '00198811', name: 'Poľnohospodárske družstvo Podunajské Biskupice', type: 'Poľnohospodárske družstvo', address: 'Lieskovská cesta 14, 821 06 Bratislava', city: 'Bratislava', lat: 48.1285, lng: 17.2145 },
    { ico: '34105214', name: 'AGRO-DRUŽSTVO Trnava', type: 'Poľnohospodárske družstvo', address: 'Trstínska cesta 8, 917 01 Trnava', city: 'Trnava', lat: 48.3895, lng: 17.5782 },
    { ico: '35763469', name: 'Slovenský poľnohospodársky podnik Nitra, a.s.', type: 'Akciová spoločnosť', address: 'Akademická 4, 949 01 Nitra', city: 'Nitra', lat: 48.3069, lng: 18.0965 }
];

const LEGACY_DEMO_LPIS_PARCELS = [
    {
        id: 'LPIS-NR-4401/A',
        ownerIco: '00190225',
        ownerName: 'PD Devio Nové Sady',
        kUzemie: 'Nové Sady (842117)',
        crop: 'Repka olejná (Brassica napus)',
        areaHa: 64.82,
        kultura: 'Orná pôda (OP)',
        center: [48.4160, 17.9860],
        coords: [
            [48.4210, 17.9780],
            [48.4225, 17.9940],
            [48.4115, 17.9960],
            [48.4100, 17.9800]
        ]
    },
    {
        id: 'LPIS-SC-1108/B',
        ownerIco: '31322832',
        ownerName: 'Poľnohospodárske družstvo Senec',
        kUzemie: 'Kráľová pri Senci (829455)',
        crop: 'Slnečnica ročná (Helianthus annuus)',
        areaHa: 82.35,
        kultura: 'Orná pôda (OP)',
        center: [48.2020, 17.4190],
        coords: [
            [48.2080, 17.4100],
            [48.2090, 17.4280],
            [48.1960, 17.4290],
            [48.1950, 17.4110]
        ]
    },
    {
        id: 'LPIS-TT-2091/C',
        ownerIco: '00189456',
        ownerName: 'AGROFARMA Dolná Krupá, a.s.',
        kUzemie: 'Dolná Krupá (812048)',
        crop: 'Pšenica letná formy ozimnej',
        areaHa: 51.40,
        kultura: 'Orná pôda (OP)',
        center: [48.4830, 17.5490],
        coords: [
            [48.4880, 17.5410],
            [48.4890, 17.5570],
            [48.4780, 17.5580],
            [48.4770, 17.5420]
        ]
    },
    {
        id: 'LPIS-BA-8812/D',
        ownerIco: '17315891',
        ownerName: 'Rulc Agro - Petržalské sady',
        kUzemie: 'Petržalka (805556)',
        crop: 'Horčica biela / Ovocný sad',
        areaHa: 39.20,
        kultura: 'Trvalé kultúry / OP',
        center: [48.0990, 17.1110],
        coords: [
            [48.1030, 17.1040],
            [48.1035, 17.1180],
            [48.0945, 17.1190],
            [48.0940, 17.1050]
        ]
    },
    {
        id: 'LPIS-KN-5530/E',
        ownerIco: '36012459',
        ownerName: 'Agrokomplex Hurbanovo, s.r.o.',
        kUzemie: 'Hurbanovo (819824)',
        crop: 'Kukurica siata na zrno',
        areaHa: 94.00,
        kultura: 'Orná pôda (OP)',
        center: [47.8720, 18.1950],
        coords: [
            [47.8775, 18.1860],
            [47.8780, 18.2040],
            [47.8665, 18.2050],
            [47.8660, 18.1870]
        ]
    }
];

const LEGACY_DEMO_CADASTRE_PARCELS = [
    {
        register: 'C',
        parcelNumber: '1204/1',
        kuName: 'Petržalka',
        kuCode: '805556',
        obec: 'Bratislava - mestská časť Petržalka',
        okres: 'Bratislava V',
        lvNumber: '1482',
        druhPozemku: 'Orná pôda',
        vyuzitie: 'Poľnohospodársky využívaná pôda (ovocný sad a orná pôda)',
        umiestnenie: 'Pozemok mimo zastavaného územia obce (extravilán)',
        vlastnik: 'Rulc Agro - Petržalské sady / SPF SR',
        areaSqM: 38450,
        areaHa: 3.85,
        source: 'ÚGKK SR Kataster (ESKN / ZBGIS)',
        center: [48.0982, 17.1125],
        coords: [
            [48.0998, 17.1105],
            [48.1001, 17.1146],
            [48.0966, 17.1144],
            [48.0964, 17.1103]
        ]
    },
    {
        register: 'C',
        parcelNumber: '440/2',
        kuName: 'Nové Sady',
        kuCode: '842117',
        obec: 'Nové Sady',
        okres: 'Nitra',
        lvNumber: '892',
        druhPozemku: 'Orná pôda',
        vyuzitie: 'Pozemok využívaný pre rastlinnú výrobu',
        umiestnenie: 'Extravilán obce',
        vlastnik: 'PD Devio Nové Sady (IČO: 00190225)',
        areaSqM: 61200,
        areaHa: 6.12,
        source: 'ÚGKK SR Kataster (ESKN / ZBGIS)',
        center: [48.4165, 17.9885],
        coords: [
            [48.4185, 17.9860],
            [48.4188, 17.9912],
            [48.4145, 17.9910],
            [48.4142, 17.9858]
        ]
    },
    {
        register: 'E',
        parcelNumber: '812/1',
        kuName: 'Kráľová pri Senci',
        kuCode: '829455',
        obec: 'Kráľová pri Senci',
        okres: 'Senec',
        lvNumber: '2310',
        druhPozemku: 'Orná pôda (Pôvodný určený operát E-KN)',
        vyuzitie: 'Pozemok evidovaný v registri E-KN zlúčený v pôdnom bloku LPIS',
        umiestnenie: 'Mimo zastavaného územia obce',
        vlastnik: 'Spoločenstvo vlastníkov / Nájom: PD Senec',
        areaSqM: 47800,
        areaHa: 4.78,
        source: 'ÚGKK SR Register E-KN (Určený operát)',
        center: [48.1985, 17.4235],
        coords: [
            [48.2005, 17.4208],
            [48.2009, 17.4262],
            [48.1965, 17.4260],
            [48.1962, 17.4206]
        ]
    },
    {
        register: 'E',
        parcelNumber: '209/4',
        kuName: 'Dolná Krupá',
        kuCode: '812048',
        obec: 'Dolná Krupá',
        okres: 'Trnava',
        lvNumber: '1105',
        druhPozemku: 'Trvalý trávny porast / Orná pôda (E-KN)',
        vyuzitie: 'Poľnohospodárska pôda v užívaní AGROFARMA Dolná Krupá, a.s.',
        umiestnenie: 'Extravilán obce',
        vlastnik: 'Súkromní vlastníci (LV č. 1105)',
        areaSqM: 52900,
        areaHa: 5.29,
        source: 'ÚGKK SR Register E-KN (Určený operát)',
        center: [48.4838, 17.5502],
        coords: [
            [48.4858, 17.5476],
            [48.4861, 17.5528],
            [48.4818, 17.5526],
            [48.4815, 17.5474]
        ]
    }
];

const LEGACY_DEMO_SPRAY_ALERTS = [
    {
        id: 5001,
        timestamp: '05. 11. 2026, 08:15',
        senderName: 'PD Devio Nové Sady (IČO: 00190225)',
        senderEmail: 'agronom@pddevio.sk',
        locationLabel: 'LPIS-NR-4401/A (Nové Sady)',
        lat: 48.4160,
        lng: 17.9860,
        affectedHivesCount: 1,
        affectedColonies: 35,
        recipients: ['vcelar.novesady@agromail.sk', 'CEVZ-NR-0881'],
        note: 'Plánovaná aplikácia prípravku v nočných hodinách mimo letu včiel.'
    },
    {
        id: 5002,
        timestamp: '04. 11. 2026, 16:40',
        senderName: 'Poľnohospodárske družstvo Senec (IČO: 31322832)',
        senderEmail: 'mechanizator@pdsenec.sk',
        locationLabel: 'LPIS-SC-1108/B (Kráľová pri Senci)',
        lat: 48.2020,
        lng: 17.4190,
        affectedHivesCount: 1,
        affectedColonies: 48,
        recipients: ['kralova@vcelari-senec.sk', 'CEVZ-BA-0142'],
        note: 'Zákonné hlásenie 48 hodín vopred pre ošetrenie porastu v 3 km pásme.'
    }
];

class ApplicationStateStore {
    constructor() {
        const savedHives = localStorage.getItem('agrogis_hives_v5');
        const savedEntities = localStorage.getItem('agrogis_entities_v5');
        const savedParcels = localStorage.getItem('agrogis_parcels_v5');
        const savedAlerts = localStorage.getItem('agrogis_alerts_v5');
        const savedSessionUser = localStorage.getItem('agrogis_current_user_v5');
        const savedPersona = localStorage.getItem('agrogis_persona_v5');

        this._state = {
            currentPersona: savedPersona || 'AGRO_PRO', // 'BEE_PRO' | 'BEE_HOBBY' | 'AGRO_PRO' | 'AGRO_HOBBY'
            currentUser: savedSessionUser ? JSON.parse(savedSessionUser) : null,
            activeEntity: null,
            activeCadastreParcel: null,
            selectedCadastreRegister: 'C',
            lastCollisionReport: null,
            interactionMode: 'NONE', // 'NONE' | 'IDENTIFY' | 'SPRAY' | 'ADD_HIVE' | 'MEASURE' | 'DRAW_PARCEL'
            isLpisLayerVisible: true,
            isHivesLayerVisible: true,
            isHiveRadiiVisible: false,
            isKatasterVisible: true,
            isDmrVisible: false,
            lpisOpacity: 0.35,
            networkStatus: navigator.onLine ? 'ONLINE' : 'OFFLINE',
            dbMode: 'HYBRID_LOCAL',
            loading: false,
            hives: savedHives
                ? JSON.parse(savedHives).filter(hive => !LEGACY_DEMO_HIVES.some(sample => sample.id === hive.id && sample.name === hive.name))
                : [],
            entities: savedEntities
                ? JSON.parse(savedEntities).filter(entity => !LEGACY_DEMO_ENTITIES.some(sample => sample.ico === entity.ico && sample.name === entity.name))
                : [],
            lpisParcels: savedParcels
                ? JSON.parse(savedParcels).filter(parcel =>
                    !LEGACY_DEMO_LPIS_PARCELS.some(sample => sample.id === parcel.id) &&
                    !String(parcel.id).startsWith('LPIS-SR-')
                )
                : [],
            cadastreParcels: [],
            sprayAlerts: savedAlerts
                ? JSON.parse(savedAlerts).filter(alert => !LEGACY_DEMO_SPRAY_ALERTS.some(sample => sample.id === alert.id))
                : []
        };

        this._listeners = new Set();
    }

    getState() {
        return Object.freeze({ ...this._state });
    }

    setState(partialState) {
        this._state = { ...this._state, ...partialState };

        if (partialState.hives) {
            localStorage.setItem('agrogis_hives_v5', JSON.stringify(this._state.hives));
        }
        if (partialState.entities) {
            localStorage.setItem('agrogis_entities_v5', JSON.stringify(this._state.entities));
        }
        if (partialState.lpisParcels) {
            localStorage.setItem('agrogis_parcels_v5', JSON.stringify(this._state.lpisParcels));
        }
        if (partialState.sprayAlerts) {
            localStorage.setItem('agrogis_alerts_v5', JSON.stringify(this._state.sprayAlerts));
        }
        if (partialState.currentPersona) {
            localStorage.setItem('agrogis_persona_v5', this._state.currentPersona);
        }
        if ('currentUser' in partialState) {
            if (partialState.currentUser) {
                localStorage.setItem('agrogis_current_user_v5', JSON.stringify(partialState.currentUser));
            } else {
                localStorage.removeItem('agrogis_current_user_v5');
            }
        }

        this._notifyListeners();
    }

    addHive(hiveObj) {
        const updated = [...this._state.hives, hiveObj];
        this.setState({ hives: updated });
    }

    removeHive(hiveId) {
        const updated = this._state.hives.filter(h => String(h.id) !== String(hiveId));
        this.setState({ hives: updated });
    }

    addLpisParcel(parcelObj) {
        const updated = [parcelObj, ...this._state.lpisParcels];
        this.setState({ lpisParcels: updated });
    }

    removeLpisParcel(parcelId) {
        const updated = this._state.lpisParcels.filter(p => p.id !== parcelId);
        this.setState({ lpisParcels: updated });
    }

    addSprayAlert(alertObj) {
        const updated = [alertObj, ...this._state.sprayAlerts];
        this.setState({ sprayAlerts: updated });
    }

    upsertEntity(entityObj) {
        const existingIdx = this._state.entities.findIndex(e => e.ico === entityObj.ico);
        let updated;
        if (existingIdx >= 0) {
            updated = [...this._state.entities];
            updated[existingIdx] = { ...updated[existingIdx], ...entityObj };
        } else {
            updated = [entityObj, ...this._state.entities];
        }
        this.setState({ entities: updated });
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _notifyListeners() {
        const currentState = this.getState();
        for (const listener of this._listeners) {
            try {
                listener(currentState);
            } catch (error) {
                console.error('[StateStore] Chyba v odberateľovi:', error);
            }
        }
    }
}

export const store = new ApplicationStateStore();
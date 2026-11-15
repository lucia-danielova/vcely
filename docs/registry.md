# Verejné registre pre IČO / názov (bez API kľúčov)

Registrácia poľnohospodára dopĺňa oficiálne údaje (názov, IČO, sídlo a ďalšie verejné polia) z viacerých bezplatných API naraz. Žiadne placené kľúče ani tajomstvá.

## Live zdroje (overené, odpovedajú)

| Register | Endpoint | Čo vracia |
| --- | --- | --- |
| **ŠÚ SR RPO** (`statistics.sk` JSON API) | `https://api.statistics.sk/rpo/v1/search` | IČO, názov, sídlo, zdrojový register, dátum vzniku (`identifier` / `fullName`) |
| **RegisterUZ MF SR** | `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky` + `…/uctovna-jednotka` | Názov UJ, sídlo, DIČ, SK NACE, právna forma |
| **ORSR MS SR** | `https://sluzby.orsr.sk/api/legal-person` | Názov, IČO, sídlo, spisová značka |
| **Slovensko.Digital Datahub RUZ** | `https://datahub.ekosystem.slovensko.digital/api/data/ruz/accounting_entities/:id` | Názov, IČO, DIČ, sídlo, právna forma, NACE (ID zdieľa s RegisterUZ) |
| **Apino.sk RPO** (voliteľné) | `https://api.apino.sk/api/v1/organizations` + `/people` | Názov, IČO, sídlo, štatutári/spoločníci — vyžaduje `APINO_API_KEY` (iba server, `.env`) |

Klient aj server volajú bezplatné zdroje paralelne. Apino beží **iba na serveri** cez env kľúč (nikdy v prehliadači / gite).

## Vyskúšané a vyradené

| Zdroj | Prečo vypadol |
| --- | --- |
| `https://statistics.sk` | DNS NXDOMAIN — neexistuje; JSON je na `api.statistics.sk` |
| `https://www.statistics.sk` / `slovak.statistics.sk` | Cloudflare challenge (HTML), nie JSON lookup |
| `https://slovensko.digital` | Marketing HTML, `response.json()` nie je možné |
| Autoform `autoform.ekosystem.slovensko.digital` | `401 Bad credentials` bez plateného `private_access_token` |
| RPVS open-data | 403 / HTML formulár |
| data.gov.sk CKAN `package_search` | redirect / nepoužiteľná JSON odpoveď |
| Finančná správa — zoznamy platiteľov DPH | HTML, bez otvoreného JSON podľa IČO |
| Finstat a komerčné agregátory | vyžadujú platený kľúč |

## Poznámky

- Demo IČO `00190225` (PD Devio Nové Sady) je lokálny seed; v živých registroch momentálne nie je.
- Overovací príklad: IČO `47700203` (NaVidieku.sk s. r. o.) — vracia RPO + RegisterUZ + ORSR + Slovensko.Digital Datahub.
- RPO môže dočasne odpovedať `429`; vtedy stačia ostatné live zdroje.

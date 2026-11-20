# API per i client nativi di Assedio a Valdombra

Un solo indirizzo per inviare e ricevere le statistiche da qualsiasi piattaforma (Android, iPhone, Windows, Mac, Linux, Steam...).
Ogni chiamata dice **chi** la fa: quale app, quale versione, quale dispositivo e, se il giocatore ha fatto l'accesso, quale profilo.
Lo script del database è `database/api-client.sql` (dalla v8.1).

## In breve

| | |
|---|---|
| **Indirizzo** | `https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api` |
| **Metodo** | `POST` |
| **Intestazioni** | `apikey: sb_publishable_rObFkpBSbC1wsQutuOYNLg_NPzCdU7n`<br>`Content-Type: application/json` |
| **Corpo** | un oggetto JSON con `azione`, `client`, `giocatore` (facoltativo) e `dati` |
| **Risposta** | sempre JSON: `{"ok": true, ...}` oppure `{"ok": false, "errore": "...", "messaggio": "..."}` |

La chiave `sb_publishable_...` è quella pubblica, la stessa che usa il gioco web: può stare nell'app.
**Nell'app non va mai messa la chiave segreta di Supabase** (`sb_secret_...` o `service_role`).

## La richiesta

```json
{
  "azione": "partita",
  "client": {
    "piattaforma": "android",
    "versione": "1.0.0",
    "dispositivo": "6f1c2b9e-3d4a-4b8f-9e2a-1c5d7e9f0a12"
  },
  "giocatore": {
    "nome": "manugiuly",
    "token": "...il token ricevuto con «accedi»..."
  },
  "dati": { }
}
```

### Chi chiama: `client` (obbligatorio, tranne che per `ping`)

| Campo | Cosa mettere |
|---|---|
| `piattaforma` | minuscole, numeri, `-` o `_`, da 2 a 16 caratteri. Nomi consigliati: `android`, `ios`, `windows`, `macos`, `linux`, `steam`, `web` |
| `versione` | la versione dell'app, fino a 12 caratteri: lettere, numeri, `.` `_` `+` `-` (es. `1.0.0`) |
| `dispositivo` | un UUID casuale creato al primo avvio e salvato sul dispositivo. Sempre lo stesso per quel dispositivo: serve a contare i visitatori unici |

### Chi gioca: `giocatore` (facoltativo)

`nome` e `token` del profilo del gioco (gli stessi profili del gioco web). Il token si ottiene con l'azione `accedi`.
Se lo mandi, il server lo controlla: se è sbagliato la chiamata viene rifiutata con `credenziali` (non diventa anonima da sola).
Se non lo mandi, la chiamata è anonima.

## La risposta

```json
{
  "ok": true,
  "azione": "partita",
  "chi": { "piattaforma": "android", "versione": "1.0.0", "giocatore": "manugiuly", "admin": false },
  "dati": { "registrata": true, "collegata_al_profilo": true }
}
```

`chi` ripete quello che il server ha riconosciuto: `giocatore` è `null` se la chiamata era anonima, `admin` è `true` solo per i profili amministratori.

La risposta HTTP è `200` anche quando `ok` è `false`: controlla sempre il campo `ok`.
Altri codici HTTP vogliono dire un problema di collegamento o di configurazione: `400` = il corpo non è un oggetto JSON (per esempio un elenco `[...]` o testo non valido), `401` = manca la chiave `apikey` o è sbagliata, `404` = script del database non applicato.

## Le azioni

### `ping`: prova di collegamento

Non scrive niente e non serve `client`.

```json
{ "azione": "ping" }
```
```json
{ "ok": true, "azione": "ping", "dati": { "api": 1, "ora": "2026-11-18T11:54:52", "azioni": ["ping", "visita", "partita", "accedi", "mie_statistiche", "admin", "reimposta_password", "amici", "gilda", "nomi"] } }
```

### `visita`: l'app è stata aperta

Da chiamare all'avvio. Il server conta al massimo una visita ogni 30 minuti per dispositivo, e non conta le visite degli amministratori (se mandi `giocatore`).
In `dati` puoi mettere `mobile` e `app` (vero/falso); se mancano, `mobile` vale vero per `android` e `ios`, `app` vale vero per tutto tranne `web`.

```json
{ "azione": "visita", "client": { "piattaforma": "android", "versione": "1.0.0", "dispositivo": "6f1c2b9e-3d4a-4b8f-9e2a-1c5d7e9f0a12" } }
```
```json
{ "ok": true, "azione": "visita", "chi": { ... }, "dati": { "contata": true } }
```
Se non è stata contata: `"dati": { "contata": false, "motivo": "gia_contata" }` (oppure `"amministratore"`).

### `partita`: fine di una partita

Gli stessi campi delle statistiche del gioco web. Con `giocatore` la partita viene collegata al profilo (e compare in `mie_statistiche`); senza, resta anonima.

| Campo in `dati` | Tipo | Note |
|---|---|---|
| `id_partita` | UUID | facoltativo ma consigliato: se la stessa partita arriva due volte (rete che cade e app che riprova) viene registrata una volta sola |
| `dungeon` | testo | obbligatorio: `rocca`, `cripte`, `abisso` (fino a 12 caratteri) |
| `modalita` | testo | obbligatorio: `norm` (normale), `surv` (Sopravvivenza), `daily` (sfida del giorno) |
| `livello` | intero | Livello di Assedio, da 0 a 10 (se manca, 0) |
| `giocatori` | intero | obbligatorio, da 1 a 8 |
| `classe` | testo | obbligatorio, l'eroe: `guerriero`, `mago`, `ladro`, `chierico`, `necromante`, `ranger`, `druido`, `monaco`, `guardiano`, `paladino` |
| `vittoria` | vero/falso | obbligatorio |
| `piano` | intero | obbligatorio, il piano raggiunto (da 0 a 100000) |
| `boss` | testo | facoltativo, il boss affrontato (fino a 16 caratteri) |
| `morte` | testo | facoltativo, i nemici che hanno sconfitto il giocatore, separati da virgola (es. `goblin,goblin,bandito`) |
| `carte` | elenco di testi | facoltativo, il mazzo: id delle carte, con `+` se migliorate (es. `["colpo", "parata+"]`), al massimo 80 |
| `reliquie` | elenco di testi | facoltativo, al massimo 40 |
| `danni` | intero | facoltativo, da 0 a 10.000.000 |
| `uccisioni` | intero | facoltativo, da 0 a 100.000 |
| `durata` | intero | facoltativo (dalla v9.3; script `database/api-durata.sql`, applicato il 18/11/2026): tempo di gioco in **secondi**, da 0 a 172.800. Conta solo il tempo giocato: come nel gioco web, una pausa lunga (oltre 2 minuti senza mosse) vale al massimo 2 minuti. Se manca o non è valido la partita si registra lo stesso, senza tempo |

```json
{
  "azione": "partita",
  "client": { "piattaforma": "ios", "versione": "1.0", "dispositivo": "..." },
  "giocatore": { "nome": "manugiuly", "token": "..." },
  "dati": {
    "id_partita": "11111111-1111-4111-8111-111111111111",
    "dungeon": "rocca", "modalita": "norm", "livello": 2, "giocatori": 1,
    "classe": "ladro", "vittoria": true, "piano": 16, "boss": "drago",
    "carte": ["colpo", "parata+"], "reliquie": ["anello"], "danni": 900, "uccisioni": 30,
    "durata": 1385
  }
}
```
```json
{ "ok": true, "azione": "partita", "chi": { ... }, "dati": { "registrata": true, "collegata_al_profilo": true, "durata_salvata": true } }
```

`durata_salvata` dice se il tempo è stato registrato (falso se `durata` manca o non è un intero tra 0 e 172.800).
Se era già arrivata: `"dati": { "registrata": false, "motivo": "gia_ricevuta" }`.
Se un campo non va bene: `{"ok": false, "errore": "dati_non_validi", "dettaglio": "..."}` con la spiegazione tecnica in `dettaglio`.

### `accedi`: entrare con il profilo

Nome e password del profilo del gioco (gli stessi del gioco web) vanno in `dati`. La risposta contiene il `token` da salvare sul dispositivo e da mandare nelle chiamate successive dentro `giocatore`. Non salvare la password.

```json
{ "azione": "accedi", "client": { ... }, "dati": { "nome": "manugiuly", "password": "..." } }
```
```json
{ "ok": true, "azione": "accedi", "chi": { "giocatore": "manugiuly", "admin": true, ... }, "dati": { "nome": "manugiuly", "token": "3932296e-...", "mostra": "ManuGiuly" } }
```
`nome` è il nome vero del profilo, sempre in minuscolo: usalo per `giocatore` e per tutte le altre chiamate. `mostra` (dalla v10.19) è **come si vede il nome**, con le maiuscole e le minuscole scelte dal giocatore: usalo solo per mostrarlo. Per i profili di prima, se `mostra` era ancora vuoto, il server lo riempie con il nome scritto qui per accedere.
Il profilo si crea dal gioco web (o con `profilo_crea`, vedi sotto). Il token resta valido finché esiste il profilo e finché nessuno cambia la password (vedi `reimposta_password`); se una chiamata risponde `credenziali`, cancella il token salvato e fai accedere di nuovo il giocatore, spiegandogli che forse la password è stata cambiata da un altro dispositivo.

### `reimposta_password`: scegliere una password nuova

Dalla v9.8 (`database/api-password.sql`, applicato il 19/11/2026). Serve `giocatore` con nome e token: chi è già collegato può scegliere una password nuova anche se ha dimenticato quella vecchia. In `dati` va la password `nuova` (da 4 a 72 caratteri).

```json
{ "azione": "reimposta_password", "client": { ... }, "giocatore": { "nome": "manugiuly", "token": "..." }, "dati": { "nuova": "..." } }
```
```json
{ "ok": true, "azione": "reimposta_password", "chi": { ... }, "dati": { "nome": "manugiuly", "token": "7d1c0a3e-..." } }
```
- La risposta contiene il **token nuovo**: salvalo al posto di quello vecchio. Il token vecchio smette di funzionare, e così quelli degli altri dispositivi (anche il gioco web): lì il giocatore deve accedere di nuovo con la password nuova.
- Errori possibili: `serve_accesso` (manca `giocatore`), `credenziali` (token non più valido: fai accedere di nuovo), `password_corta`.
- Non salvare né mandare la password altrove; il token nuovo non finisce nel registro delle chiamate.
- Nel gioco web la stessa cosa sta in Profilo → «Reimposta la password».

### `amici`: la lista amici

Dalla v10.4 (`database/amici.sql` e `database/api-amici.sql`, applicati il 19/11/2026; in alternativa ci sono gli indirizzi diretti `amici_*` della tabella più sotto, che fanno le stesse cose). Serve `giocatore` con nome e token. In `dati` c'è `op` (se manca vale `lista`):

| `op` | Altri campi in `dati` | Risposta in `dati` |
|---|---|---|
| `lista` | — | `{"amici": [{"nome", "stato", "dal"}], "codice": "K7PX2M"}`; `stato` è `amici`, `ricevuta` (ti ha chiesto l'amicizia), `inviata` (l'hai chiesta tu) o `bloccato` (l'hai bloccato tu) |
| `richiedi` | `nome` | `{"esito", "nome"}` |
| `rispondi` | `nome`, `si` (true accetta, false rifiuta) | `{"esito", "nome"}` |
| `togli` | `nome` | `{"esito", "nome"}`: toglie l'amico, annulla la richiesta inviata o sblocca |
| `blocca` | `nome` | `{"esito", "nome"}` |
| `codice` | `nuovo` (facoltativo, true = codice nuovo, il vecchio non vale più) | `{"codice"}` |
| `usa_codice` | `codice` (6 caratteri, maiuscole, minuscole e trattini vanno bene) | `{"esito", "nome"}`: si diventa amici subito |

```json
{ "azione": "amici", "client": { ... }, "giocatore": { "nome": "manugiuly", "token": "..." }, "dati": { "op": "richiedi", "nome": "pandoris" } }
```
```json
{ "ok": true, "azione": "amici", "chi": { ... }, "dati": { "esito": "inviata", "nome": "pandoris" } }
```
- **Esiti** (sono risposte normali con `ok: true`, da mostrare al giocatore): `inviata`, `amici` (siete amici: anche quando l'altro ti aveva già chiesto l'amicizia), `gia_amici`, `gia_inviata`, `non_trovato` (nessun profilo con quel nome, oppure ti ha bloccato: per riservatezza non si distingue), `se_stesso`, `bloccato_da_te`, `troppe_richieste` (50 in attesa), `troppi_amici` (200), `nessuna_richiesta`, `rifiutata`, `tolto`, `bloccato`, `codice_sbagliato`.
- Errori: `serve_accesso`, `credenziali` (token non più valido: fai accedere di nuovo), `dati_non_validi` (`op` sconosciuta).
- I nomi sono sempre in minuscolo. Il token non finisce nel registro delle chiamate.

**Chi è in gioco e inviti (Realtime, come il gioco web).** Con il profilo collegato il gioco si iscrive al canale Supabase Realtime `valdombra-amici` con la presenza; la chiave della presenza **non è il nome** ma la sua impronta: `'a' + (hashStr('am#' + nome_in_minuscolo) >>> 0).toString(36)`, dove `hashStr` è la stessa funzione del gioco web (`index.html`). Un amico è «in gioco» se la sua impronta è tra le chiavi della presenza. Per invitare un amico nella propria stanza si manda sullo stesso canale il broadcast `invito` con `{"a": impronta_dell_amico, "da": mio_nome, "dm": come_si_vede_il_mio_nome, "c": "ABCD"}` (codice della stanza; `dm` dalla v10.19, facoltativo: si mostra solo se è uguale a `da` a parte le maiuscole). Chi lo riceve lo mostra solo se `a` è la sua impronta e `da` è nella sua lista amici; «Entra» fa entrare nella stanza `c` come col link d'invito.

### `nomi`: come si vedono i nomi (maiuscole e minuscole)

Dalla v10.19 (`database/nomi.sql`). Ogni profilo ha un nome vero in minuscolo (per accedere, per gli amici, per la gilda e per tutte le chiamate) e un nome **da mostrare** con le maiuscole e le minuscole scelte dal giocatore (`Manu`, `MANU`, `manu`...). Serve `giocatore`.

- `{"op": "mio"}` → `{ "nome": "manu", "mostra": "Manu" }`: come si vede il mio nome.
- `{"op": "mio", "nuovo": "MaNu"}` → cambia come si vede il mio nome e risponde come sopra. Può cambiare **solo maiuscole e minuscole** (lettere, numeri, `_ . -`, da 3 a 20): altrimenti errore `nome_diverso`.
- `{"op": "lista", "nomi": ["pandoris", "luca"]}` (al massimo 200) → `{ "nomi": { "pandoris": "PanDoris", "luca": "luca" } }`: per mostrare amici, membri e richieste della gilda, i migliori della settimana. I nomi che non esistono non ci sono. Le chiavi sono in minuscolo.

```json
{ "azione": "nomi", "client": { ... }, "giocatore": { "nome": "manu", "token": "..." }, "dati": { "op": "lista", "nomi": ["pandoris", "luca"] } }
```
- Errori: `serve_accesso`, `credenziali`, `nome_diverso`, `dati_non_validi` (`op` sconosciuta o `nomi` che non è una lista da 0 a 200).
- Mostra sempre `mostra` al posto del nome vero; per confrontare due nomi usa sempre quello in minuscolo. Se un nome non è nella risposta, mostra quello in minuscolo.

### `gilda`: la gilda

Dalla v10.8 (`database/gilde.sql` e `database/api-gilde.sql`, applicati il 19/11/2026; in alternativa ci sono gli indirizzi diretti `gilda_*` più sotto). In `dati` c'è `op` (se manca vale `mia`). `cerca` va anche senza `giocatore`; tutto il resto serve `giocatore` con nome e token.

| `op` | Altri campi in `dati` | Risposta in `dati` |
|---|---|---|
| `cerca` | `testo` (facoltativo) | `{"gilde": [{"id", "nome", "descrizione", "aperta", "membri", "posti", "livello"}]}` (al massimo 30) |
| `mia` | — | `{"gilda": {"id", "nome", "descrizione", "aperta", "posti", "livello", "pe", "creata", "codice"}, "io": {"ruolo", "pe", "entrato"}, "membri": [{"nome", "ruolo", "pe", "entrato"}], "richieste": [{"nome", "creata"}]}`; `codice` e `richieste` solo per capo e vice. Senza gilda: `{"gilda": null, "richieste_mie": [{"id", "nome"}]}` |
| `crea` | `nome` (3-24 caratteri), `aperta` (true), `descrizione` | `{"esito", "id"}` — **nel gioco costa 150 Corone**: toglile prima e restituiscile se l'esito non è `creata` |
| `entra` | `id` | `{"esito"}`: `entrato` se è aperta, `richiesta_inviata` se è chiusa |
| `usa_codice` | `codice` | `{"esito", "id", "nome"}`: si entra subito anche se è chiusa |
| `annulla` | `id` | `{"esito"}` (annulla una mia richiesta) |
| `rispondi` | `nome`, `si` | `{"esito"}` (capo o vice) |
| `caccia` | `nome` | `{"esito"}` (il capo chiunque, il vice solo i membri) |
| `ruolo` | `nome`, `ruolo` (`vice`, `membro`, `capo`) | `{"esito"}` (solo il capo; `capo` passa il comando e lui diventa vice) |
| `esci` | — | `{"esito"}`: `uscito`, o `sciolta` se era l'ultimo; se esce il capo comanda il vice (o il membro) più vecchio |
| `modifica` | `aperta`, `descrizione`, `nome` (quelli che mancano non cambiano) | `{"esito"}` (solo il capo) |
| `codice` | `nuovo` (facoltativo) | `{"codice"}` (capo o vice; null per gli altri) |
| `posto` | — | `{"esito", "posti"}` (solo il capo, fino a 30) — **nel gioco si paga in Gemme**: il posto numero n+1 costa `5 + 2 × (n − 15)` Gemme (16° 5, 17° 7, … 30° 33); toglile prima e restituiscile se l'esito non è `fatto` |

- **Esiti**: `creata`, `entrato`, `richiesta_inviata`, `gia_in_gilda`, `gia_richiesta`, `piena`, `non_trovata`, `troppe_richieste` (10 mie in attesa o 50 per gilda), `codice_sbagliato`, `nome_non_valido`, `nome_usato`, `annullata`, `rifiutata`, `nessuna_richiesta`, `non_permesso`, `cacciato`, `fatto`, `uscito`, `sciolta`, `massimo`, `se_stesso`, `non_trovato`, `non_in_gilda`, `ruolo_non_valido`.
- I compagni di gilda in gioco si vedono e si invitano come gli amici (presenza e broadcast `invito` sul canale `valdombra-amici`): chi riceve un invito lo accetta se viene da un amico **o da un compagno di gilda**.
- **Dungeon di gilda** (dalla v10.11, `database/gilde3.sql`, applicato il 19/11/2026; l'endpoint unico non cambia): in `partita` c'è anche `dungeon` = grado da 1 a 10 (0 o assente se non è un dungeon di gilda). La risposta ha `dungeon`: `null` (partita normale, persa o non in gruppo), `{"premio": false, "grado"}` (premio del giorno già preso: vale come partita normale) oppure `{"premio": true, "grado", "corone", "gemme", "pe_gilda", "pe_tuoi"}`: Corone e Gemme finiscono tra i premi da ritirare (motivo `dungeon:<grado>`), `pe_tuoi` sono i PE personali contati una seconda volta, `pe_gilda` i PE alla gilda (0 se la gilda li ha già presi oggi). Il grado non può superare il livello della gilda (il server lo abbassa). `mia` ha anche `"dungeon": {"oggi": grado o null, "gilda_oggi": true/false}` (giorno dell'ora di Roma).
- L'invito a un dungeon di gilda è lo stesso broadcast `invito` con in più `g` = grado (0 o assente per un invito normale): a chi lo riceve si mostra «X apre il dungeon di gilda (grado N) nella stanza ABCD».

### `mie_statistiche`: le statistiche di chi chiama

Serve `giocatore`. Restituisce due cose:

- `sincronizzate`: le statistiche salvate nel profilo, le stesse del Diario del gioco web (partite, vittorie, eroi, dungeon... da tutti i dispositivi). È l'oggetto `valdombra-statistiche` del salvataggio; vuoto se il profilo non ha ancora giocato.
- `inviate`: il riassunto delle partite mandate con `partita` collegate al profilo: totali, per piattaforma, per eroe, per dungeon e le ultime 10.

```json
{
  "ok": true, "azione": "mie_statistiche", "chi": { ... },
  "dati": {
    "giocatore": "manugiuly",
    "sincronizzate": { "runs": 12, "wins": 5, "cls": { "ladro": { "runs": 4, "wins": 2, "best": 16 } }, "...": "..." },
    "inviate": {
      "partite": 1, "vittorie": 1, "miglior_piano": 16, "miglior_tempo": 1385, "uccisioni": 30,
      "prima": "2026-11-18T10:54:52+00:00", "ultima": "2026-11-18T10:54:52+00:00",
      "piattaforme": { "ios": 1 },
      "eroi": [ { "eroe": "ladro", "partite": 1, "vittorie": 1, "miglior_piano": 16 } ],
      "dungeon": [ { "dungeon": "rocca", "partite": 1, "vittorie": 1, "livello_max": 2 } ],
      "ultime": [ { "quando": "2026-11-18T10:54:52+00:00", "piattaforma": "ios", "dungeon": "rocca", "modalita": "norm", "livello": 2, "eroe": "ladro", "vittoria": true, "piano": 16 } ]
    }
  }
}
```

### `admin`: i numeri del pannello di amministrazione

Serve `giocatore` con un profilo amministratore (oggi `manugiuly`). Restituisce in `dati` lo stesso oggetto che usa il pannello del gioco web: visite, visitatori unici, grafici, piattaforme, profili, partite, eroi, dungeon, nemici, carte, classifica, versioni e chiamate dei client (`api`). Per gli altri profili risponde `non_autorizzato`.

## Errori

| `errore` | Quando |
|---|---|
| `richiesta_non_valida` | il corpo è più grande di 200 KB (se non è proprio un oggetto JSON risponde il server con HTTP `400`) |
| `azione_sconosciuta` | `azione` mancante o diversa da quelle elencate |
| `client_non_valido` | manca `client` o uno dei suoi campi non va bene |
| `troppe_richieste` | più di 30 chiamate in un minuto dallo stesso dispositivo: aspetta un minuto |
| `credenziali` | nome, password o token sbagliati |
| `serve_accesso` | l'azione richiede `giocatore` |
| `non_autorizzato` | il profilo non è amministratore |
| `dati_non_validi` | un campo di `dati` manca o non va bene (vedi `dettaglio`) |
| `password_corta` | in `reimposta_password` la password nuova ha meno di 4 o più di 72 caratteri |
| `nome_diverso` | in `nomi` il nome nuovo non è lo stesso a parte le maiuscole e le minuscole |
| `errore_interno` | problema del server: riprova più tardi |

Ogni errore ha anche `messaggio`, un testo in italiano che si può mostrare al giocatore.

## Regole utili

- Crea il `dispositivo` una volta sola, al primo avvio, e salvalo. Se l'app viene reinstallata ne nasce uno nuovo (conta come nuovo visitatore).
- Rispetta la scelta del giocatore: se nell'app spegne le statistiche, non mandare `visita` né `partita`.
- Per `partita` crea un `id_partita` nuovo per ogni partita e, se la rete cade, riprova con lo stesso: non verrà contata due volte.
- Le chiamate sbagliate per `credenziali` o `non_autorizzato` rispondono dopo mezzo secondo: è voluto, rallenta chi prova password a caso.
- Le visite degli amministratori non vengono contate se mandi `giocatore` con `visita`.

## Esempi

### curl

```bash
curl -s https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api \
  -H "apikey: sb_publishable_rObFkpBSbC1wsQutuOYNLg_NPzCdU7n" \
  -H "Content-Type: application/json" \
  -d '{"azione":"ping"}'
```

### Kotlin (Android, con OkHttp)

```kotlin
val client = OkHttpClient()
val json = "application/json".toMediaType()

fun api(richiesta: JSONObject): JSONObject {
    val req = Request.Builder()
        .url("https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api")
        .header("apikey", "sb_publishable_rObFkpBSbC1wsQutuOYNLg_NPzCdU7n")
        .post(richiesta.toString().toRequestBody(json))
        .build()
    client.newCall(req).execute().use { r -> return JSONObject(r.body!!.string()) }
}

// all'avvio (fuori dal thread principale)
val dispositivo = prefs.getString("dispositivo", null)
    ?: UUID.randomUUID().toString().also { prefs.edit().putString("dispositivo", it).apply() }
val risposta = api(JSONObject()
    .put("azione", "visita")
    .put("client", JSONObject().put("piattaforma", "android").put("versione", BuildConfig.VERSION_NAME).put("dispositivo", dispositivo)))
if (!risposta.getBoolean("ok")) Log.w("Valdombra", risposta.optString("messaggio"))
```

### Swift (iPhone e Mac, con URLSession)

```swift
func api(_ richiesta: [String: Any]) async throws -> [String: Any] {
    var req = URLRequest(url: URL(string: "https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api")!)
    req.httpMethod = "POST"
    req.setValue("sb_publishable_rObFkpBSbC1wsQutuOYNLg_NPzCdU7n", forHTTPHeaderField: "apikey")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: richiesta)
    let (dati, _) = try await URLSession.shared.data(for: req)
    return try JSONSerialization.jsonObject(with: dati) as? [String: Any] ?? [:]
}

let dispositivo = UserDefaults.standard.string(forKey: "dispositivo") ?? {
    let id = UUID().uuidString.lowercased(); UserDefaults.standard.set(id, forKey: "dispositivo"); return id }()
let risposta = try await api([
    "azione": "partita",
    "client": ["piattaforma": "ios", "versione": "1.0", "dispositivo": dispositivo],
    "giocatore": ["nome": nome, "token": token],
    "dati": ["id_partita": UUID().uuidString.lowercased(), "dungeon": "rocca", "modalita": "norm",
             "giocatori": 1, "classe": "ladro", "vittoria": true, "piano": 16]
])
```

### C# (Windows, Unity, .NET)

```csharp
static readonly HttpClient http = new HttpClient();

static async Task<JsonDocument> Api(object richiesta)
{
    var req = new HttpRequestMessage(HttpMethod.Post, "https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api");
    req.Headers.Add("apikey", "sb_publishable_rObFkpBSbC1wsQutuOYNLg_NPzCdU7n");
    req.Content = new StringContent(JsonSerializer.Serialize(richiesta), Encoding.UTF8, "application/json");
    var r = await http.SendAsync(req);
    return JsonDocument.Parse(await r.Content.ReadAsStringAsync());
}

var risposta = await Api(new {
    azione = "mie_statistiche",
    client = new { piattaforma = "windows", versione = "1.0.0", dispositivo = idDispositivo },
    giocatore = new { nome, token }
});
if (!risposta.RootElement.GetProperty("ok").GetBoolean())
    Console.WriteLine(risposta.RootElement.GetProperty("messaggio").GetString());
```

Con le librerie ufficiali di Supabase (supabase-kt, supabase-swift, supabase-csharp, supabase-js) la stessa chiamata è `rpc("api", richiesta)`.

## Altri indirizzi già pronti

Per il resto del gioco online il client può usare gli stessi indirizzi del gioco web (stesse intestazioni):

| Cosa | Indirizzo (`POST`) | Corpo |
|---|---|---|
| Creare un profilo | `/rest/v1/rpc/profilo_crea` | `{"p_nome": "...", "p_pass": "...", "p_dati": {}}` → `[{"token", "rev"}]` |
| Reimpostare la password | `/rest/v1/rpc/profilo_password` | `{"p_nome": "...", "p_token": "...", "p_nuova": "..."}` → `[{"token"}]` (il token nuovo; quello vecchio non vale più) |
| Leggere il salvataggio | `/rest/v1/rpc/profilo_leggi` | `{"p_nome": "...", "p_token": "..."}` → `[{"dati", "rev"}]` |
| Salvare | `/rest/v1/rpc/profilo_salva` | `{"p_nome", "p_token", "p_dati", "p_rev"}` → nuova revisione, oppure la revisione attuale in negativo se un altro dispositivo ha salvato prima (allora rileggi, unisci e riprova) |
| Amici: lista | `/rest/v1/rpc/amici_lista` | `{"p_nome", "p_token"}` → `[{"nome", "stato", "dal"}]` |
| Amici: chiedere, accettare, togliere, bloccare | `/rest/v1/rpc/amici_richiedi` · `amici_rispondi` · `amici_togli` · `amici_blocca` | `{"p_nome", "p_token", "p_altro": "pandoris"}` (per `amici_rispondi` anche `"p_si": true`) → l'esito in parole, es. `"inviata"` |
| Amici: il mio codice | `/rest/v1/rpc/amici_codice` | `{"p_nome", "p_token", "p_nuovo": false}` → `"K7PX2M"` |
| Amici: usare un codice | `/rest/v1/rpc/amici_usa_codice` | `{"p_nome", "p_token", "p_codice": "K7PX2M"}` → `[{"nome", "esito"}]` |
| Gilda: cercare | `/rest/v1/rpc/gilda_cerca` | `{"p_testo": "lupi"}` (anche senza profilo) → `[{"id", "nome", "descrizione", "aperta", "membri", "posti", "livello"}]` |
| Gilda: la mia | `/rest/v1/rpc/gilda_mia` | `{"p_nome", "p_token"}` → lo stesso oggetto di `op: mia` |
| Gilda: creare, entrare, codice | `/rest/v1/rpc/gilda_crea` · `gilda_entra` · `gilda_usa_codice` · `gilda_annulla` | `{"p_nome", "p_token", "p_gilda": "Nome", "p_aperta": true, "p_descrizione": ""}` · `{"p_nome", "p_token", "p_gilda": 3}` · `{"p_nome", "p_token", "p_codice": "QW3RTY"}` · `{"p_nome", "p_token", "p_gilda": 3}` |
| Gilda: capo e vice | `/rest/v1/rpc/gilda_rispondi` · `gilda_caccia` · `gilda_ruolo` · `gilda_modifica` · `gilda_codice` · `gilda_posto` | `{"p_nome", "p_token", "p_altro", "p_si"}` · `{"p_nome", "p_token", "p_altro"}` · `{"p_nome", "p_token", "p_altro", "p_ruolo"}` · `{"p_nome", "p_token", "p_aperta", "p_descrizione", "p_gilda"}` · `{"p_nome", "p_token", "p_nuovo"}` · `{"p_nome", "p_token"}` |
| Gilda: uscire | `/rest/v1/rpc/gilda_esci` | `{"p_nome", "p_token"}` → `"uscito"` o `"sciolta"` |
| Classifica Sopravvivenza | `GET /rest/v1/classifica?modalita=eq.solo&dungeon=eq.rocca&order=punteggio.desc&limit=20` | — |

Gli indirizzi completi iniziano con `https://ucwuhzupgsvtphsdmlqf.supabase.co`.

## Da allineare nell'app (gioco web)

Cambiamenti recenti del gioco web da riportare nell'app per restare uguali:

- **v9.5**: la forma **Gufo** del Druido fa di nuovo pescare 2 carte in più all'inizio del turno (dalla 9.0 era spenta per errore).
- **v9.6 → v9.8**: per qualche ora le carte si potevano giocare cliccando la carta ingrandita; dalla **9.8** non più. Le carte si giocano solo dalla mano e il lato Ombra si sceglie col pulsante «Lato Ombra» (che diventa «Lato Luce» per tornare indietro). La carta ingrandita mostra le due facce solo in anteprima.
- **v9.7**: nel combattimento a scena, in gruppo, i compagni stanno nella colonna del proprio eroe, subito sopra di lui (compatti da 4 giocatori in su).
- **v9.8**: nel Profilo c'è «Reimposta la password» (qui: azione `reimposta_password`). Dopo il cambio tutti gli altri dispositivi devono accedere di nuovo.
- **v10.0**: in gruppo contano i voti di tutti quelli che hanno votato (anche se per un attimo risultano scollegati); con una maggioranza si parte subito con il messaggio «Si va: … (3 voti contro 1)», il sorteggio solo col pareggio. Chi entra in una stanza riprova ogni 2,5 secondi e aspetta fino a 40 secondi chi l'ha creata. I messaggi della chat si mostrano una volta sola. L'intenzione del nemico contiene sempre il bersaglio («→ nome»).
- **v10.1**: l'Ombra **non cala più da sola** a ogni turno di sola Luce: scende solo riposando a un Falò acceso (−3), con l'Incenso, dal Pellegrino o col Tempio. Lo Scudo di Luce (+3 Armatura a fine turno con 0-2 Ombra e solo carte Luce) resta, con la scritta «+3 Armatura». **Al Falò l'Ombra cala solo con la scelta nuova «Medita accanto al fuoco»** (−3, tutta col Tempio al 3; non cura); «Riposa» e «Affila le armi» non la toccano più. Nelle Retrovie del cancello la stessa scelta si chiama «Prega con gli abitanti». Sulla mappa il numero dei voti è un cerchietto chiaro con il numero scuro.
- **v10.2**: **Gemme più rare**: 1 per ogni boss (prima 2), 1 per la vittoria, 1 per la sfida del giorno (prima 2), 1 per ogni Impresa (prima 3); per le missioni 1 sola Gemma e solo se le completi tutte e tre (prima 1 per missione); nell'Aprite il cancello 1 Gemma solo se salvi tutti i 40 abitanti (prima 1 da 30 e 2 a 40). Le Gemme già guadagnate restano. Nell'Aprite il cancello il pulsante dopo la ricompensa dice «Prossima ondata (N/8)» o «Vai alle Retrovie» invece di «Prosegui sulla mappa». A fine partita in gruppo il riquadro di corone e gemme sta dentro la barra in alto e non copre i pulsanti. Sui campi password c'è l'occhio per mostrare e nascondere quello che si scrive.
- **v10.3**: **carte con lo stesso nome interno**: nel web la seconda cancellava la prima. Se l'app ha copiato le carte dal web, controlla che abbia queste 6 carte con i nomi nuovi: `raggiogelo` (Raggio di Gelo del Mago: è nel **mazzo iniziale del Mago** al posto di `gelo`, che resta la carta di stato «Gelo nelle Ossa»), `pioggiadardi` (Pioggia di Dardi, Mago), `barrierapr` (Barriera Prismatica, Mago; il potenziamento la porta a costo 1), `rafficalame` (Raffica di Lame, Ladro), `ventagliocolt` (Ventaglio di Coltelli, Ladro), `giudiziofede` (Giudizio del Chierico, danni pari all'Armatura). Il **Monaco** parte con `rafficapugni` (Raffica di Pugni) invece di `raffica`. Illustrazioni in `pixel/carte/` e `pixel/carte-ombra/` con gli stessi nomi. **Monaco più debole**: Acqua 1 PV, Terra 2 Armatura, Aria 2 danni (Fuoco resta 2 Bruciatura); Rosario di Giada 2 Armatura. **Corone circa dimezzate**: vittoria 40/55/70 più 10 per Livello di Assedio, missioni 10, cancello 2 per abitante, Imprese a metà. **Cancello**: dietro l'eroe un abitante per ogni salvato meno i persi (file da 10), con l'animazione di chi entra e di chi viene preso. Consigli aggiornati, il riquadro non copre l'elemento indicato.
- **v10.4**: **Amici** (serve il profilo). Finestra «Amici» (da Profilo, schermata Multigiocatore, menu e stanza): codice amico con Copia e «Fanne uno nuovo», aggiungi per nome (richiesta) o con il codice (amici subito), richieste ricevute con Accetta / Rifiuta / Blocca, lista amici con il pallino verde per chi è in gioco e «Togli» con conferma, richieste inviate con Annulla, bloccati con Sblocca. Nella stanza il riquadro «Invita i tuoi amici» mostra gli amici in gioco con «Invita». Chi riceve l'invito vede in alto «X ti invita nella stanza ABCD — Entra / No, grazie»; durante una partita di gruppo in corso solo «Più tardi» (l'invito resta in Amici 10 minuti). Pallino rosso con il numero delle richieste su Amici e Profilo; avviso quando arriva una richiesta. Presenza e inviti: vedi la sezione `amici` più sopra.
- **v10.5**: l'azione `amici` dell'endpoint unico è attiva. **Mappa**: falò ed eventi più rari a ogni Livello di Assedio (probabilità ×(1 − 0,08 × livello)); un falò, evento o tesoro casuale diventa combattimento se un nodo che porta lì è dello stesso tipo o se farebbe tre bonus di fila (la fila di tesori al piano 9 e quella prima del boss restano fisse); prima del boss falò fino al livello 3, al livello 4 tipi a caso ma senza falò, al livello 5 solo élite; in Sopravvivenza e nel cancello conta come livello 0. **Falò**: dal livello 3 curano il 15% dei PV (20% con le Erbe del Villaggio al 2). **Riepilogo del percorso** sotto la mappa per ogni percorso disegnato: da solo con le parole, in gruppo nome, numeri e icone.
- **v10.6**: **esperienza degli eroi (PE) più lenta**: a fine partita 3 PE per piano, 1 per nemico ucciso, 15 per la vittoria e 5 per Livello di Assedio (prima 10, 2, 100 e 25), minimo 5 e **al massimo 90 a partita**, così per il livello 10 (2.700 PE) servono almeno 30 partite. Le soglie dei livelli non cambiano e i PE già guadagnati restano.
- **v10.7**: l'**Ombra** del giocatore si vede sempre nella barra in alto («Ombra N/10», anche sulla mappa) e con la sua barra in cima alle stanze: Mercante, Falò (anche spento), eventi, tesori e strade segrete, perché alcune scelte dipendono da quanta Ombra hai.
- **v10.8**: **Gilde** (serve il profilo). Finestra «Gilda» accanto ad «Amici» (Profilo, Multigiocatore, menu, stanza). Senza gilda: le mie richieste (Annulla), entra con codice, cerca (Entra se aperta, «Chiedi di entrare» se chiusa, «Piena»), crea (nome, descrizione, aperta/chiusa, **150 Corone**). In gilda: nome, livello, aperta/chiusa, membri x/posti; richieste (capo e vice) con Accetta/Rifiuta; membri col pallino verde e i pulsanti per ruolo (capo: Fai vice / Togli vice, Fai capo, Allontana; vice: Allontana i membri); codice d'invito (capo e vice) con Copia e «Fanne uno nuovo»; impostazioni del capo (aperta/chiusa, nome, descrizione, **posto in più a 5 + 2 × (posti − 15) Gemme**, fino a 30); «Esci dalla gilda» con conferma. Nella stanza «Invita» anche per i compagni di gilda in gioco (etichetta «gilda»); gli inviti si accettano da amici e compagni di gilda.
- **v10.9**: **settimana della gilda** (`database/gilde2.sql`, applicato): a fine partita il gioco chiama `gilda_partita(p_nome, p_token, p_id uuid nuovo per partita, p_dati {vinta, piano, assedio, nemici, elite, boss, abitanti, gruppo})` → `{esito, pe, punti_boss, missioni_completate, gilda}`; una volta sola per id, 40 al giorno. `gilda_mia` ora ha anche `settimana` (missioni, boss, io, migliori) e `premi` da ritirare; `gilda_ritira(p_nome, p_token, p_id null)` → `{corone, gemme, premi}` da aggiungere nel gioco. Bonus della gilda a inizio partita (non nella sfida del giorno): liv. 2 +5% oro dai combattimenti, 4 una pozione, 6 +5 PV max, 8 +10% oro, 10 una reliquia. Livello personale (PE 100/300/600/1000/1500/2200/3000/4000/5000), titoli Recluta 1, Scudiero 3, Cavaliere 5, Campione 7, Leggenda 10; aspetti «Stendardo» (5) e «Leggenda» (10) in `pixel/aspetti/`. Nell'endpoint unico l'azione `gilda` ha anche le operazioni `partita` (`{op:'partita', id: UUID nuovo per partita, partita: {vinta, piano, assedio, nemici, elite, boss, abitanti, gruppo}}`) e `ritira` (`{op:'ritira', premio?}` → `{corone, gemme, premi}`), da `database/api-gilde2.sql`, applicato il 19/11/2026.
- **v10.24**: **Druido**: due carte nuove per la forma Gufo, `picchiata` (Picchiata del Gufo, Attacco comune, costo 1: 7 danni, potenziata 10; in forma di Gufo +1 danno per ogni carta in mano) e `occhinotte` (Occhi nella Notte, Abilità non comune, costo 0, con bersaglio: 2 Vulnerabile, potenziata 3; in forma di Gufo a **tutti** i nemici e pesca 1 carta). Ora il Druido ha 14 carte. Le altre forme sono più deboli: **Pantera +2 danni** per colpo (era +3), **Orso 1 Armatura** a inizio turno (era 2; resta +1 da ogni carta che dà Armatura), **Serpente 1 Veleno** per Attacco (era 2); testi in `FORMS` e nel glossario. **Mostri per dungeon**: nelle Cripte e nell'Abisso i nemici contano come se il Livello di Assedio fosse più alto di 2 e di 4 (`DG_LV={rocca:0,cripte:2,abisso:4}`, sommato al livello scelto, anche a 0): PV ×(1 + 0,1 × livello, + 0,05 × livello per élite e boss) e danni in più per colpo come `dmgBonus(livello)`; non vale nell'Aprite il cancello né nel dungeon di gilda. Nel combattimento il livello dei mostri è `R.combat.Lm` (quello scelto resta `R.combat.L` per ricompense e testi). La scelta del dungeon mostra «Mostri più forti: +20% PV e +1 danni per colpo» (Cripte) e «+40% PV e +2» (Abisso). **Aprite il cancello**: nelle statistiche locali (che seguono il profilo) ci sono `pRuns`, `pSalvati`, `pPersi`, `pBest`; nel Diario → Statistiche c'è il riquadro «Aprite il cancello» con partite, salvati in tutto, persi in tutto e record (nessun cambio al database). **Aspetto prima della partita**: sotto la scelta dell'eroe (da solo e nella stanza) c'è «Aspetto del/della …» con «Classico» e gli aspetti già comprati o di gilda; toccandone uno si sceglie (come nella Bottega; in gruppo arriva ai compagni col solito `loadout`). **Impresa** `eroi10` («Leggenda di Valdombra»): ora chiede di vincere con **tutti gli eroi** (13), l'id resta lo stesso così chi l'ha già presa la tiene. **Aspetti rifatti** di Chierico, Chierica, Fabbro e Fabbra (file `pixel/aspetti/chierico*`, `fabbro*`, tutti e 7 gli aspetti con le 4 pose): ora si ricolorano anche le ombre della veste; se l'app ha copiato le immagini, vanno ricopiate.
- **v10.23**: **nuovo eroe, il Fabbro** (`fabbro`, al femminile «Fabbra»; nano/nana; 84 PV, 120 Corone; `classe: "fabbro"`). Reliquia iniziale `incudine` (Incudine Runica): dopo ogni combattimento vinto `incN` +1; a 2 (a 1 col talento `fb5`, effetto `inc`) si azzera e `forgia` +1. Fuori dal combattimento, se `forgia` > 0, in alto c'è il pulsante **«Forgia»**: si sceglie una carta del mazzo non potenziata e il gioco manda l'azione `{t:'forgia', i: indice nel mazzo}` (la carta diventa potenziata per sempre, `forgia` −1). Stato `plate` (**Corazza**: a inizio turno dà altrettanta Armatura; cala di 1 quando un nemico toglie PV). Potere `officina` (a ogni turno potenzia una carta a caso della mano). Le carte potenziate in combattimento lo sono solo nella copia del combattimento; **Capolavoro** potenzia anche la carta del mazzo (stessa `k`). **Affilatura**: `af` sulle carte in mano si somma ai danni (`d`). 14 carte: `colpomartello`, `scudoforgiato`, `forgiare`, `martellorun`, `piastra`, `scintille`, `affilatura`, `lancioincudine`, `birra`, `officina`, `martellata`, `rinforzare`, `capolavoro`, `armaleggend`; mazzo iniziale 4 Colpo di Martello, 4 Scudo Forgiato, Forgiare, Martello Runico. Lato Ombra esteso: anche la Corazza (`cz`) cresce. Poteri Luce/Ombra: 2 Corazza / 2 carte potenziate in mano al primo turno. Talenti `fb1`-`fb5` (effetti nuovi `plate` e `inc`). Aspetti: Cremisi, Smeraldo, Dorato, Ombra, Gelo, Stendardo, Leggenda (ricolorano grembiule, scudo e stivali). Immagini `pixel/fabbro*`, `pixel/icone/r_incudine.png`. Sfida del giorno dal 21/11/2026. Prove 7ao.
- **v10.22**: la finestra del menu «Eroi» (prima «Crescita degli eroi») ha due pannelli: **«Crescita eroi»** (abilità uniche, come prima) e **«Personaggi»** (tutti gli eroi con figura, PV, livello, descrizione e reliquia; quelli da sbloccare con il pulsante «Sblocca per 120 Corone» che chiede conferma; si resta nella finestra). Nel menu principale il riquadro «Eroi» ha i pulsanti «Abilità uniche» e «Personaggi». Nella **Bottega**, «Aspetti degli eroi» mostra **tutti** gli eroi (quelli da sbloccare con il lucchetto): i loro aspetti si vedono ma si comprano solo dopo aver sbloccato l'eroe (pulsante «Sblocca in Eroi → Personaggi»). Prove 7an.
- **v10.21**: **nuovo eroe, il Berserker** (`berserker`, al femminile resta «Berserker»; 84 PV, 120 Corone; `classe: "berserker"`). Reliquia iniziale `totem` (Totem della Furia). **Furore** (non è uno stato salvato: si calcola) = ha `totem` e PV ≤ 50% dei massimi (60% col talento `br3`, effetto `fur:10`): ogni colpo dei suoi Attacchi fa +3 danni (`FUR_D`, prima dei moltiplicatori, come la Forza); nella barra dell'eroe il chip «Furore +3». Stato `immortale` (Furore Immortale: fino al suo prossimo turno i PV non scendono sotto 1; si toglie a inizio turno). Potere `furiacieca` (Forza quando perde PV per una sua carta). 14 carte: `colpoascia`, `pelledura`, `sanguexsangue`, `setesangue`, `ritosangue`, `turbineascia`, `caricaselv`, `sprezzo`, `urlosel`, `furiacieca`, `doppiaascia`, `bevisangue`, `immortale`, `vendetta`; mazzo iniziale 4 Colpo d'Ascia, 4 Pelle Dura, Sangue per Sangue, Sete di Sangue. Le carte che ridanno vita curano una parte dei danni fatti davvero alla vita del nemico. Poteri Luce/Ombra: recupera 5 PV / perde 4 PV (non sotto 1) e ottiene 2 Forza. Talenti `br1`-`br5`. Aspetti: Cremisi, Smeraldo, Dorato, Ombra, Gelo, Stendardo, Leggenda (ricolorano cuoio e pellicce). Immagini come per il Bardo (`pixel/berserker*`, `pixel/icone/r_totem.png`). Nella Sfida del giorno dal 21/11/2026 (`HERO_DAY`). Prove 7am.
- **v10.20**: **nuovo eroe, il Bardo** (`bardo`, al femminile «Barda»; 68 PV, 120 Corone; nelle statistiche `classe: "bardo"`). Reliquia iniziale `liuto` (Liuto Incantato: a ogni turno 2 Ispirazione). Stati nuovi sugli eroi: `insp` (**Ispirazione**: il prossimo Attacco fa danni in più pari all'Ispirazione a ogni colpo, poi si consuma; si somma prima di Debole/Vulnerabile/lato Ombra, come la Forza) e `bis` (**Bis!**: la prossima carta tranne i Poteri si gioca due volte, sullo stesso bersaglio o sul primo nemico vivo). Poteri `canzone` (Canzone del Coraggio: a ogni turno Ispirazione a sé, in gruppo a tutti) e `leggenda` (Leggenda Vivente: l'Ispirazione data è doppia). 14 carte: `stoccata`, `passodanza`, `cantoisp`, `accordo`, `strimpellata`, `ritornello`, `corog`, `melodia`, `scherno`, `bis`, `canzonecor`, `ninnananna`, `granfinale`, `leggendaviva`; mazzo iniziale 4 Stoccata, 4 Passo di Danza, Canto Ispirato, Accordo Dissonante. Lato Ombra esteso: anche l'Ispirazione (`i`) cresce del 50%. Poteri Luce/Ombra: 3 Ispirazione a tutti / 1 Vulnerabile e 1 Debole a tutti i nemici. Talenti `bd1`-`bd5` (nuovo effetto `insp`). Aspetti: Cremisi, Autunno, Dorato, Ombra, Gelo, Stendardo, Leggenda. Immagini: `pixel/bardo*.png`, `pixel/bardo-f*.png`, `pixel/aspetti/bardo(-f)-<aspetto>*.png`, `pixel/carte/<id>.png` e `pixel/carte-ombra/<id>.png` (non per i due Poteri), `pixel/icone/r_liuto.png`. **Sfida del giorno**: un eroe nuovo entra solo dal giorno dopo l'uscita (`HERO_DAY`, Bardo dal 21/11/2026), così i giorni già passati non cambiano; l'app deve usare la stessa regola. Prove 7al.
- **v10.19**: **nomi con le maiuscole e le minuscole** (`database/nomi.sql`, migrazione `nomi_maiuscole` applicata il 20/11/2026). Il nome vero resta in minuscolo (per accedere va scritto come si vuole); in più c'è come si vede: colonna `profili.mostra`. Nel gioco web: `profilo_crea` salva il nome come è stato scritto; `profilo_accedi` riempie `mostra` se è ancora vuoto; `profilo_mostra(p_nome, p_token, p_nuovo?)` → testo (legge o cambia, solo maiuscole e minuscole, altrimenti `nome_diverso`); `nomi_mostra(p_nome, p_token, p_nomi text[])` → `{nome: come si vede}` (al massimo 200). Nell'endpoint unico l'azione `nomi` (op `mio` e `lista`) e `mostra` nella risposta di `accedi`. Nel Profilo il pannello «Come si vede il tuo nome» (campo e «Salva»). Il gioco mostra il nome scelto nel Profilo, in Impostazioni, tra gli amici, nella gilda (membri, richieste, chi colpisce di più il boss), negli inviti e in combattimento da solo; il nome delle stanze preso dal profilo usa quello scelto. Le azioni (accetta, togli, caccia, invita...) e i confronti usano sempre il nome in minuscolo. Nell'invito Realtime c'è il campo nuovo `dm` (come si vede il nome di chi invita): si usa solo se è uguale a `da` a parte le maiuscole. Profili di prima: all'avvio, se il nome si vede ancora tutto minuscolo, il gioco usa il nome delle stanze del dispositivo se è lo stesso nome con le maiuscole. Prove 7ak.
- **v10.18**: in gruppo, quando il tuo eroe è **a terra**, al posto della mano compare «Sei morto/morta» con cosa puoi fare (un compagno può rianimarti con una carta o con la Piuma di Fenice; se il gruppo vince il combattimento ti rialzi con un quarto dei PV) e il pulsante «Esci dal dungeon»; nella barra in basso «Sei morto: aspetta i compagni». Prima diceva «Hai finito il turno… Riprendi il turno».
- **v10.17**: **Provocazione** vale anche contro gli attacchi che colpiscono tutto il gruppo: se un eroe ha Provocazione, un attacco «a tutti» (danni ed effetti, per esempio Debole) colpisce solo lui; sopra il nemico la scritta «→ tutti» diventa «→ te» o il nome di chi provoca.
- **v10.16**: **eroine**. Sopra la scelta dell'eroe «Genere: Maschile / Femminile» (uno per tutti gli eroi, gratis), salvato in `valdombra-genere` (`m`/`f`) e sincronizzato nel profilo come le altre chiavi. Nomi femminili: Guerriera, Maga, Ladra, Chierica, Necromante, Ranger, Druida, Monaca, Guardiana, Paladina (con gli articoli al femminile: «della Maga», «con la Guerriera»). Immagini: `pixel/<eroe>-f.png` e `pixel/<eroe>-f-attacco|difesa|colpito.png` (strisce di 7 celle 84×84), aspetti in `pixel/aspetti/<eroe>-f-<aspetto>(-attacco|-difesa|-colpito).png`; se un'immagine femminile manca si usa quella maschile. Gli aspetti posseduti (`eroe@aspetto`) valgono per tutte e due le versioni. **Guerriero** e **Ladro** maschi hanno figure, animazioni e aspetti nuovi (stessi nomi di file). In gruppo il genere va nello zaino che si manda alla stanza (`loadout` con `g: 'm'|'f'`), e nella stanza e in combattimento ognuno si vede col suo. I testi che parlano al giocatore si adattano («Sei caduta», «Ti sei ammalata», «Sei sicura…», «Bentornata»). In combattimento da solo il nome dell'eroe è il **nome del profilo** con l'iniziale maiuscola (senza profilo il nome dell'eroe); in gruppo resta il nome scelto.
- **v10.15**: **password dimenticata** (`database/recupero.sql`, applicato il 19/11/2026; per ora solo come indirizzi diretti `rest/v1/rpc/...`, non nell'endpoint unico). Nel Profilo il pannello «Codice di recupero»: `profilo_recupero_stato(p_nome, p_token)` → `{ha, creato}`; `profilo_recupero_nuovo(p_nome, p_token)` → il codice `XXXX-XXXX-XXXX` (mostralo una volta sola con «Copia», non salvarlo). Nella schermata d'accesso «Ho dimenticato la password»: `profilo_recupera(p_nome, p_codice, p_nuova)` → `[{token, esito}]`, con `esito` `fatto` (poi accedi normalmente con la password nuova) o `codice_sbagliato`; errori `password_corta` e `troppi_tentativi` (5 codici sbagliati in un'ora). Il codice si consuma. Per gli amministratori `admin_reimposta_password(p_nome, p_token, p_altro)` → `{esito: fatto|non_trovato, nome, password}` (provvisoria, da mostrare una volta). Ogni cambio fa uscire gli altri dispositivi.
- **v10.14**: nella **Bottega** ogni oggetto dice quanti se ne possono portare e quanti sono già nello zaino (pozioni 2 e reliquie 2 in tutto; Borsa del Mercenario fino a 3, Elisir di Vigore 2, Addestramento 2): nei titoli «(puoi portarne 2 in tutto · nello zaino N)», nei riquadri di «Altro» «Puoi prenderne X / Nello zaino: N» o, a limite raggiunto, «Al massimo / N su X». Nel menu principale la **descrizione sotto il titolo** è giustificata e larga quanto la pagina.
- **v10.13**: nel menu principale l'**immagine della rocca si vede sempre intera** (16:9, senza tagli): larga quanto lo schermo su telefono, su schermi larghi al centro e alta al massimo 400 punti (o metà dell'altezza dello schermo). Prima su PC era una striscia alta 240 che tagliava cielo e sentiero.
- **v10.12**: **niente più sezione Sviluppo** nelle Impostazioni: tutto è nel gioco. **Luce e Ombra sempre accesa** e **«Ombra per tutti gli eroi» accesa per tutti** (anche se il giocatore l'aveva spenta): ogni carta tranne i Poteri ha il lato Ombra; cure, Marchio, Condanna, Debole, evocazioni, carte pescate e Fervore +50%, le carte senza numeri fanno pescare 1 carta in più (con +1 Ombra come sempre). In gruppo quindi `lo` e `lox` della partita sono sempre veri. In **Impostazioni → Grafica** gli interruttori «Combattimento a scena» e «Menu essenziale» (solo sul dispositivo); in combattimento, nella barra in basso accanto a Pesca e Scarti, il pulsante **«A scena»** che accende e spegne la grafica a scena al volo (premuto quando è accesa) e la ricorda.
- **v10.11**: **dungeon di gilda**. Nella stanza c'è la modalità «Dungeon di gilda» (solo per chi è in una gilda); la apre chiunque della gilda anche dalla finestra «Gilda» («Apri il dungeon di gilda» crea la stanza e invita i compagni in gioco; nella stanza «Invita tutta la gilda»). Giocano **da 2 a 8 membri della stessa gilda** (chi non c'è blocca la partenza: «X non è nella gilda Y»; per saperlo il loadout porta anche `gil.i`, l'id della gilda). Si gioca nel dungeon del **boss della settimana della gilda** (`settimana.boss.boss`: drago/signoreguerra → Rocca, lich/verme → Cripte, tiranno/colosso → Abisso), senza bisogno di averlo sbloccato. **Mappa di 8 piani più il boss** (piano 1 combattimento, piano 5 forziere, piano 8 falò, élite dal piano 3 con il 25%, nessun altro falò, mercante 7%, eventi 15% × (1 − 0,08 × Assedio)); in alto «Piano N/9» e «Grado N»; climi su 2 dei piani 3, 4, 6, 7. **Gradi da 1 al livello della gilda** (massimo 10): il grado g vale come l'Assedio ⌊g/2⌋ e i nemici hanno vita e danni × (1 + 0,05 × (g − 1)); il boss ha in più ×1,25 di vita. Niente missioni della partita, sblocchi di dungeon o livelli, classifiche e statistiche anonime; la vittoria non conta per le Imprese «completa un dungeon» né per le richieste del Villaggio. A fine partita: metà delle Corone di una vittoria normale (arrotondate), la Gemma della vittoria, e `gilda_partita` con `dungeon` = grado; premio del giorno (vedi sopra): 5 × grado Corone, 1 Gemma dal grado 4 e 2 dal grado 8, PE personali doppi, 30 × grado punti in più al boss della settimana, alla gilda 100 + 50 × grado PE una volta al giorno. Pulsanti di fine: «Continua: grado N+1» (se sbloccato) / «Rigioca il grado N», da sconfitti «Riprova il grado N» / «Riprova al grado N−1»; tornando alla stanza la modalità resta «Dungeon di gilda».
- **v10.10**: nel menu principale i riquadri «Gilda» (nome, livello, titolo, missioni fatte su 3, vita del boss in %, premi da ritirare; pulsante «Vai alla gilda») e «Amici» (quanti, quanti in gioco, richieste e inviti; «Vai agli amici»), con il pallino rosso dei messaggi; nel menu essenziale le caselle «Gilda» e «Amici» (8 caselle in 2 file da 4).

## Riservatezza

- Le visite non salvano nomi né indirizzi IP: solo il codice casuale del dispositivo, la versione, la piattaforma, se è un telefono e se è un'app.
- Il registro delle chiamate salva azione, piattaforma, versione, dispositivo, profilo (se c'è) ed esito. Non lo può leggere nessuno dall'esterno: i numeri arrivano riassunti solo al pannello di amministrazione.
- Le partite mandate con `giocatore` sono collegate a quel profilo; quelle senza restano anonime come quelle del gioco web.

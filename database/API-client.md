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
{ "ok": true, "azione": "ping", "dati": { "api": 1, "ora": "2026-11-18T11:54:52", "azioni": ["ping", "visita", "partita", "accedi", "mie_statistiche", "admin", "reimposta_password"] } }
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
{ "ok": true, "azione": "accedi", "chi": { "giocatore": "manugiuly", "admin": true, ... }, "dati": { "nome": "manugiuly", "token": "3932296e-..." } }
```
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

## Riservatezza

- Le visite non salvano nomi né indirizzi IP: solo il codice casuale del dispositivo, la versione, la piattaforma, se è un telefono e se è un'app.
- Il registro delle chiamate salva azione, piattaforma, versione, dispositivo, profilo (se c'è) ed esito. Non lo può leggere nessuno dall'esterno: i numeri arrivano riassunti solo al pannello di amministrazione.
- Le partite mandate con `giocatore` sono collegate a quel profilo; quelle senza restano anonime come quelle del gioco web.

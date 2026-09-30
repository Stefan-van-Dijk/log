# Kilometerregistratie

Een lokale, mobiele webapp/PWA voor kilometerregistratie. De app is bewust geschikt gemaakt voor hosting op **GitHub Pages** en gebruikt standaard geen eigen backend.

## Wat zit in deze eerste versie?

- Vertrek en aankomst als doorlopende kilometertellerketen.
- Het beginadres en de startkilometerstand komen automatisch van de laatste bestemming/eindstand.
- Bekende locaties met herkenningsstraal (standaard 500 meter).
- GPS-locatie bij vertrek/aankomst en tijdens een actieve rit maximaal één opgeslagen trackpunt per minuut.
- Navigatie rechtstreeks via de **Apple Kaarten-app** op iPhone, zonder MapKit JS en zonder API-key.
- Bij vertrek kun je de route in Apple Kaarten openen en de daar getoonde actuele routeafstand handmatig als voorstel invullen.
- Als je geen afstand invult, gebruikt de app eerdere A→B-ritten als voorstel wanneer die beschikbaar zijn.
- Kilometerstand blijft de administratieve werkelijkheid: `eindstand - startstand = gereden km`.
- Verdeling in **woon-werk**, **zakelijk** en **privé**.
- Een privédeel kan binnen een woon-werk- of zakelijke rit worden toegekend.
- Tankmoment registreert locatie + kilometerstand maar verandert **niet** de A→B-ritketen.
- Weekoverzicht (ISO-week, maandag t/m zondag).
- Rapport over week, maand of vrije periode.
- Rapport als CSV, delen via iOS Share Sheet, e-mailtekst en print/PDF.
- Lokale JSON-backup/import.
- PWA/offline-cache.

## GitHub Pages publiceren

1. Maak een nieuwe GitHub repository, bijvoorbeeld `kilometerregistratie`.
2. Upload alle bestanden uit deze map naar de root van de repository.
3. Open **Settings → Pages** in de repository.
4. Kies bij *Build and deployment* voor **Deploy from a branch**.
5. Selecteer `main` en `/ (root)` en sla op.
6. Open daarna de GitHub Pages-URL op je iPhone in Safari.
7. Kies **Deel → Zet op beginscherm** om de app als PWA te gebruiken.

HTTPS is noodzakelijk voor geolocatie. GitHub Pages levert HTTPS.

## Apple Kaarten

De app gebruikt **geen Google Maps API en geen MapKit JS**. Bij vertrek opent de knop **Open route in Apple Kaarten** rechtstreeks de Apple Kaarten-app met het gekozen vertrekpunt en de bestemming. Hiervoor is geen API-key nodig.

Apple Kaarten kan actuele verkeerssituaties en omleidingen meenemen in de route die je daar ziet. Een gewone webapp mag de berekende routeafstand echter niet automatisch teruglezen uit de Apple Kaarten-app. Daarom kun je de getoonde afstand desgewenst handmatig invullen als routevoorstel. Laat je dit leeg, dan gebruikt de app eerdere ritten tussen dezelfde locaties als voorstel.

## Belangrijk: GPS in de achtergrond op iPhone

De app gebruikt `watchPosition()` en bewaart tijdens een actieve rit maximaal één laatst bekende GPS-positie per minuut. In een normale webapp/PWA kan iOS Safari achtergrondprocessen echter pauzeren zodra de app langere tijd niet actief is of de telefoon wordt vergrendeld. Daardoor is een exact punt **iedere minuut niet gegarandeerd**.

De database bewaart de GPS-punten wel als losse brondata (`trackPoints`). Daardoor kan later een SVG-path of native iOS-wrapper worden toegevoegd zonder de bestaande ritdata te veranderen.

## E-mailrapporten

Omdat GitHub Pages statisch is, kan de browser niet zelfstandig op een vast tijdstip een e-mail verzenden wanneer de app gesloten is. Deze versie ondersteunt daarom:

- een e-mailconcept naar het ingestelde adres;
- CSV downloaden;
- CSV via de iOS Share Sheet delen;
- printen / als PDF bewaren.

Voor volledig automatische week- of maandmail kan later een kleine serverless backend worden toegevoegd, bijvoorbeeld met Supabase, Cloudflare Workers of een andere mailfunctie. De huidige datastructuur is hierop voorbereid, maar de lokale gegevens moeten dan ook veilig naar die backend worden gesynchroniseerd.

## Privacy en opslag

Ritten, locaties, taken en instellingen worden lokaal in de browser bewaard; GPS-trackpunten gebruiken aanvullend IndexedDB. Publiceer daarom nooit een export- of back-upbestand in de openbare GitHub-repository.

Maak regelmatig via **Instellingen → Data & back-up → Complete export** één herstelbare JSON-bundel. Die bevat de brondata van kilometer- en tijdregistratie, de vaste identiteitstabel en het afgeleide kaart-/relatiemodel. **Alleen kilometerback-up** blijft beschikbaar voor een losse kopie van de kilometergegevens. Browserdata kan verdwijnen wanneer websitegegevens worden gewist of een apparaat wordt vervangen.

## Bestanden

- `index.html` — app-shell
- `styles.css` — mobiele interface
- `app.js` — registratie-, GPS-, route-, rapport- en opslaglogica
- `manifest.webmanifest` — PWA-configuratie
- `sw.js` — offline-cache
- `icons/icon.svg` — app-icoon

## Logische vervolgstappen

1. SVG-path genereren uit GPS-trackpunten/delta's.
2. Kaartweergave van gereden en voorgestelde route.
3. Native iOS-wrapper voor betrouwbaardere achtergrondlocatie.
4. Automatische rapportmail via serverless backend.
5. Synchronisatie tussen meerdere apparaten.
6. Detectie van ontbrekende ritten wanneer huidige GPS niet aansluit op de laatst bekende bestemming.

## Update v2 – locaties toevoegen

- Handmatig een locatie opslaan kan met alleen **naam + adres**.
- GPS-coördinaten zijn niet verplicht voor opslaan; zonder GPS doet de locatie alleen niet mee aan de automatische 500 m-herkenning.
- In het locatiescherm kun je met **Gebruik huidige GPS** latitude/longitude automatisch invullen.
- Decimale GPS-coördinaten werken nu correct op iPhone, inclusief invoer met een komma.
- De offline-cache is verhoogd naar v2 zodat updates vanaf GitHub Pages sneller zichtbaar worden.

## Update v3 – Apple Kaarten

- Google Maps en de API-key zijn uit de app verwijderd.
- Route openen gebeurt rechtstreeks in Apple Kaarten.
- De actuele routeafstand uit Apple Kaarten kan handmatig worden ingevoerd als voorstel.
- Zonder handmatige routeafstand gebruikt de app eerdere A→B-ritten.
- De locatieherkenning binnen de ingestelde straal blijft via de iPhone-GPS werken.

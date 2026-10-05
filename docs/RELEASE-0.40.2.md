# Log 0.40.2 — herstel en eerste gebruik

## Wijzigingen

- Expliciete export-/herstel-API in de hoofdapp. Zowel een complete JSON-export als de online back-up gebruiken deze route.
- Nieuwe exports nemen ook de aanvullende Log-opslagcollecties mee: voertuigen, verbindingen, samenwerking, deelstatussen, archief en appinstellingen. Opslagnamen zijn portable tussen de live- en testnaamruimte. Niet-Log-opslag en adreszoekcache worden niet meegenomen.
- Herstel valideert alle bronnen vóór de eerste wijziging. Bij een opslag- of GPS-schrijffout wordt de vorige staat teruggezet. Een dubbele, vreemde of onbekende herstelbron wordt geweigerd. Dit is terugzetten bij afgehandelde fouten, geen garantie tegen een browsercrash of gelijktijdig schrijven vanuit een ander tabblad.
- Oudere complete exports blijven bruikbaar; ontbrekende aanvullende bronnen worden niet gewist. De herstelvraag benoemt deze beperking. Een oude export krijgt niet achteraf gegevens die daarin nooit zijn opgenomen.
- Eerste rit: ontbrekende kilometerstand en vertrekplek worden samen ingevuld, zonder verplichte GPS, kenteken of persoonsgegevens. De stand wordt ook bij het actieve voertuig bewaard. Er wordt nog geen rit gestart zonder de normale vertrekbevestiging.
- Nieuwe gebruikers kiezen Ritten, Tijd of Kaarten, of slaan de introductie over. Bestaande navigatiekeuzes worden niet overschreven. Hulp & ontdekken is bereikbaar via het menu en Instellingen. Tips zijn optioneel, opnieuw te openen en lokaal bewaard; geen nieuwe polling of analytics.
- Gegevens-/privacyuitleg bij instellingen en hulp, inclusief onversleutelde lokale exports, externe diensten, privé te bewaren codes en de grenzen van intrekken.
- Gedeelde invoervelden hebben gekoppelde labels. Kaartdetails hebben zichtbare bewerk- en verwijderacties naast swipe. Dit is geen volledige toegankelijkheidscertificering.
- De modushost bestaat ook vóór de eerste service-workercontrole; de startkeuze is niet afhankelijk van een HTML-transformatie door de service worker.

## Controle

Reproduceerbaar: `npm ci --ignore-scripts && npm run verify`.

De releasecontrole omvat productie-JS-syntax, de werkelijke hoofdapp met export/herstel, lege installatie, oudere exports, ongeldige bronnen, quota-/schrijffouten, optional guidance, de samengestelde scriptloader, live-opslagrouting, voertuigstart, offline en online exportopbouw, IndexedDB-herstel, kaartbediening en de eerdere schermupdate-/GPS-hervatregressies.

De ongesorteerde historische tests blijven apart beschikbaar via `npm run test:legacy`; die suite is nog niet volledig groen. De releasecontrole vervangt geen fysieke telefoon-, VoiceOver/TalkBack-, belasting- of serverbeveiligingstest.

## Nog open vóór brede introductie

- WARMTE-01: door Stefan gemelde warmte en onvoldoende vloeiendheid. Op verzoek apart houden; niet opgelost verklaard door deze release.
- Onafhankelijke geheimen/toegangstokens en een gecoördineerde migratie van bestaande persoonsverbindingen, plus serverautorisatie, objecteigenaarschap, conflict-/locktests en misbruikbeperking. De PHP-server op sharon.life wordt niet door GitHub Pages bijgewerkt. Bestaande verbindingen worden in deze release niet verbroken of opnieuw uitgegeven. Geen gevoelige gegevens gebruiken zolang dit niet afgerond is.
- Overige historische testverwachtingen en browserfixtures, volledige gebaarvrije bediening, opslagcrash-/meerdere-tabbladscenario's, gebruikersproef en platformmatrix.

Maak na deze update een nieuwe complete back-up en bewaar die naast de eerdere export. Test herstel eerst op een lege, afzonderlijke installatie; overschrijf niet je enige werkende kopie.

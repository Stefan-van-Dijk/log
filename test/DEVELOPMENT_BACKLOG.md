# Log — Ontwikkelbacklog

## Test 0.34.4 — QR als aanleiding bij Acties

Geïmplementeerd in `test/**`; productie blijft 0.34.2.

- Acties → Nieuwe actie/Bewerken → Aanleiding: Locatie of QR-code scannen. QR-acties hebben geen locatie/GPS of bezoekreset nodig; elke bewuste scan biedt de actie opnieuw aan. Actief, dagen en tijdvak blijven gelden. Taak vraagt de normale startbevestiging; rit wordt voorbereid; kaart wordt geopend na aantikken.
- Nieuwe QR-identifiers: exact 12 willekeurige tekens uit `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`, gegenereerd met `crypto.getRandomValues`. Controle tegen bestaande gegevens, acties, kaarten en in deze sessie voorgestelde codes; bij een botsing opnieuw genereren. Opgeslagen actie-ID blijft vast bij bewerken. Bestaande betekenisvolle codes blijven geldig.
- Actiedetails → QR-kaart maken: QR bevat uitsluitend de identifier. De huidige generator levert daarvoor 21×21 modules bij foutcorrectie M, plus witte marge. Oude JSON `log-task` en `log-task:` blijven ondersteund; gewone UPC-barcodeherkenning blijft intact.
- Bestaande thema-/subthema-koppelingen worden aanvullend als QR-acties opgenomen in de bestaande `locationActions`-collectie. `logActionCode` markeert eenmalige migratie: verwijderen/pauzeren wordt niet ongedaan gemaakt door opnieuw scannen. Gegevens, lokale IDs, opslagcodes en registraties blijven behouden.
- Thema-configuratie maakt willekeurige IDs, ook bij KIP-voorinstellingen, en neemt bijbehorende vaste taakacties mee. Herimport is idempotent; botsende koppelingen worden geweigerd. De database/API voor online opzoeken is toekomstwerk; deze versie werkt lokaal na configuratie-import.
- Gerichte controles: QR-acties aanmaken/bewerken/scannen, casegevoelige 12-tekenidentifiers, collision retry, 21×21 QR, taak/rit/kaart, geen GPS-uitvoering, pauzeren en gewijzigde voorstellen, configuratie-overdracht en herimport, legacy-QR/deletie, behoud historie, bestaande locatieacties en scanner. iPhone/camera praktijkcontrole blijft open.

## Test 0.34.3 — KIP-configuratie en compacte taak-QR

Geïmplementeerd en gericht gecontroleerd in `test/**`; productie blijft 0.34.2.

- Kaarten → Log-code maken → Thema-configuratie (KIP): vier afzonderlijke hoofdthema-voorinstellingen; optionele subthema’s per regel. Eerst controleren, daarna expliciet lokaal bewaren en configuratie-QR maken.
- Configuratie blijft achterwaarts compatibel `log-code` versie 1 (`entities`, lege `actions`). Herhaald importeren voegt geen duplicaten toe; lokale namen/kleuren en bestaande registraties blijven behouden. Een bestaande subthema-ID wordt nooit naar een ander thema verplaatst.
- Kaarten → Log-code maken → Compacte actie-QR: hoofdthema en optioneel één bijbehorend subthema. Payload `{"kind":"log-task","version":1,"id":"KIP1a0000000"}`; tevens herkenning van `log-task:KIP1a0000000`. ID exact 12 ASCII letters/cijfers/underscore/koppelteken.
- Nieuwe configuraties krijgen stabiele `logCodeId`-waarden. Voor bestaande langere IDs blijft `logCodeId` intact en wordt aanvullend een 12-teken `taskCodeId` bewaard/exporteerd. Conflicterende koppelingen worden afgewezen, niet overschreven.
- Scan → Taak starten → normale Tijd/Taken-startdialoog → Start. Alleen hoofdthema is geldig; een eerder gesuggereerd subthema wordt niet overgenomen. Subthemanaam wordt als bewerkbare notitie ingevuld. Een actieve taak (ook uit een andere tab) wordt niet vervangen.
- Onbekende code toont “Deze Log-code is nog niet geconfigureerd.” met Terug.
- Checks: `task-code-regression.cjs`, `log-code-regression.cjs`, `action-task-regression.cjs` en JavaScript-syntax. Camera/iPhone-PWA praktijkcontrole nog uitvoeren.

Dit document is de vaste ontwikkel- en wensenlijst voor de testomgeving van **Log**.

## Werkwijze

Bij iedere nieuwe ontwikkeling of wijziging:

1. Lees eerst deze backlog voordat code wordt aangepast.
2. Controleer de actuele `main`-branch; GitHub is de bron van waarheid.
3. Werk uitsluitend binnen `test/**` zolang de testfase actief is.
4. Behoud bestaande gebruikersgegevens en opslagstructuren; migraties moeten veilig en achterwaarts compatibel zijn.
5. Werk bij voorkeur één klein backlog-item tegelijk af.
6. Lees en controleer alleen de bestanden, functies, configuratie en afhankelijkheden die relevant zijn voor de wijziging. Doorloop de volledige app niet onnodig.
7. Test gericht: controleer de gewijzigde functionaliteit plus directe raakvlakken en regressierisico's. Breid de testscope alleen uit wanneer de wijziging gedeelde shell-functionaliteit, navigatie over meerdere modules, opslag/migraties of andere centrale afhankelijkheden raakt.
8. Werk na iedere wijziging dit document bij met status, korte toelichting en waar mogelijk commit/PR.
9. Een item krijgt pas de status **Geïmplementeerd** wanneer de code is toegevoegd én binnen de relevante testscope functioneel is gecontroleerd.
10. Problemen of regressies worden als apart item toegevoegd in plaats van stilzwijgend meegenomen.
11. Nieuwe ideeën worden eerst als **Nieuw** toegevoegd en pas daarna ingepland.

## Versienummering vanaf 26 september 2026

- Gebruik normale versienummers zonder `-test` in het nummer. De omgeving wordt afzonderlijk aangeduid als TEST of LIVE.
- Live is 0.33.0. De testreeks begint nu bij **0.33.1**, als opvolger van 0.31.10-test.124; daarna 0.33.2, 0.33.3, enzovoort.
- Wanneer de testversie wordt goedgekeurd voor de volgende livegang, wordt deze **0.34.0**. Zet bij die promotie test en live op dezelfde release; volgende testontwikkeling begint bij **0.34.1**.
- Herhaal dit patroon bij volgende releases: live 0.N.0, verdere testontwikkeling 0.N.1 en hoger, volgende goedgekeurde livegang 0.(N+1).0.
- Een ander versienummer publiceert niet automatisch naar live. Bewaar de gescheiden omgevingen en bestaande opslagcodes.
- Werk per release de hoofdversie, assetversies, serviceworkercache en shell-fallbacks samen bij. Oude releaseverwijzingen in deze backlog blijven als historie behouden.

## Statussen

- **Nieuw** — wens vastgelegd, nog niet beoordeeld.
- **Gepland** — scope voldoende duidelijk en klaar om uit te voeren.
- **Bezig** — implementatie loopt.
- **Testen** — gebouwd, maar nog te controleren in de testomgeving/iPhone-PWA.
- **Geïmplementeerd** — gebouwd en functioneel gecontroleerd.
- **Geblokkeerd** — kan niet verder door een afhankelijkheid of fout.
- **Vervallen** — bewust niet meer nodig.

## Backlog

| ID | Onderwerp | Status | Omschrijving | Implementatie / notitie |
|---|---|---|---|---|
| ACTION-006 | Volgende geldigheid en instelbare herhaling | Testen | Toon wanneer of onder welke voorwaarde een actie opnieuw kan gelden; kies eigen wachttijd. | Test 0.33.10: compacte status bij elke actie, berekend volgend tijdstip met ingestelde weekdagen/tijdvak; wachttijd in minuten/uren/dagen voor kaart-, rit- en taakacties, naast volgend bezoek/locatiewisseling/volgende dag. Oude 30-minutenregels blijven werken. Opslaan/resetten wacht op een overgang. Klembord gelijkgetrokken voor Tijd en taken in navigatie en instellingen. Gerichte periode-, overgangs-, formulier-, touch- en shelltests geslaagd; iPhone-controle volgt. |
| ACTION-005 | Compact actieoverzicht, relevante velden en touch-reset | Testen | Alleen titel, type-icoon, typekleur en één actieomschrijving; formulier toont uitsluitend relevante velden. | Test 0.33.9: verborgen formuliervelden met expliciete CSS afgeschermd en uitgeschakeld; kaart/bestemming/thema dynamisch, subthema alleen bij beschikbare opties, dagen en tijdvak op aanvraag. Swipe-reset direct uitgevoerd via gedeelde controller met touchondersteuning en bevestiging; GPS-status vervangt de lijst niet meer. Gerichte CSS-, formulier-, touch-, overgangs- en shellregressies geslaagd; iPhone-praktijkcontrole volgt. |
| ACTION-004 | Wachten op verandering en swipe-reset | Testen | Na bewaren, bewerken, resetten en parkeren geen directe uitvoering door alleen aanwezigheid. | Test 0.33.8: per actie blijvende overgangsstatus; wacht op aankomst of ingaan tijdvak. Slimme ritvoorstellen na bevestigd vertrek (20 seconden buiten GPS-marge). Swipe naar rechts zet actie opnieuw klaar, wist wachttijd en al-getoondstatus en wacht opnieuw op verandering. Bestaande opslag blijft intact. Gerichte overgangs-, swipe-, locatie- en shellregressies geslaagd; praktijkcontrole op iPhone volgt. |
| BUG-005 | Kaarten wachten op verborgen of automatisch voorbereid formulier | Testen | Verborgen moduleformulieren blokkeerden de automatische acties; een automatisch ritvoorstel kon GPS-kaarten blijven tegenhouden. | Test 0.33.7: alleen zichtbare formulieren blokkeren; kaart mag boven onaangeraakt automatisch ritvoorstel, met behoud van de ritinvoer. Handmatig bewerkte invoer blijft beschermd. Per actie reden voor wachten zichtbaar. Auto in kop Instellingen → Ritten; slimme instelling beschikbaar zodra Ritten aanstaat, ook vóór eerste rit. Gerichte regressies geslaagd; daadwerkelijke oorzaak op telefoon nog te bevestigen. |
| ACTION-003 | Locatiegebruik en slimme ritvoorstellen bij instellingen | Testen | Geen hoofdschakelaar in Acties; locatiecontrole blijft actief bij zichtbare app en toestemming. Slimme ritvoorstellen met autosymbool onder Instellingen → Ritten. | Test 0.33.6: oude uitgeschakelde locatievoorkeur blokkeert niet meer. Uitleg, toestemmingsstatus en opnieuw controleren onder Instellingen → Locaties. Ritten verborgen op beide navigatieplekken verbergt de slimme instelling en blokkeert ritvoorstellen. Individuele acties blijven aan/uit te zetten. Gerichte GPS-, instellingen- en shellregressies geslaagd; telefooncontrole volgt. |
| ACTION-002 | Rustige kaarten en slimme voorstellen | Testen | Herhaling per kaartactie instellen; vaste of algoritmische rit-/taakvoorstellen; slimme ritactie uitsluitend voor ritgebruikers. | Test 0.33.5: geen herhaalkeuzes op de kaart; bestaande algoritmen hergebruikt. Slimme ritactie in Ritten, instelbaar bij Acties, eenmaal per eindpunt. Laatste afgeronde rit is leidend voor vertrek en exacte kilometerstand; handmatige vertrekkeuze en controle op intussen gewijzigd eindpunt. Gerichte integratie- en regressiecontroles geslaagd; echte telefooncontrole volgt. |
| ACTION-001 | Acties direct voorbereiden en kaarten onderdrukken | Testen | Module heet Acties. Kaarten verschijnen direct; ritten en taken worden voorbereid zonder tussenliggende bevestiging. | Test 0.33.4: wacht op open formulieren/dialogen. Bij actieve taak expliciete keuze tussen tussenstop volgens bestaande aftrekregels of atomair afronden/starten. Kaartkeuzes 30 minuten, tot herkende andere locatie of lokale middernacht; gewone sluitactie blijft eenmaal per bezoek. Geldt ook bij handmatig geopende/herkende kaarten met gekoppelde acties. Gerichte taak-, opslag-, GPS-, tijd-, kaart- en volledige shellregressies geslaagd; telefooncontrole volgt. |
| LOCATION-001 | Locatieacties als aparte module | Testen | Losse regels verbinden locaties aan ritvoorstellen, taken via thema/subthema en kaarten, met optionele dagen en tijden. | Test 0.33.3: opt-in locatieherkenning zolang Log zichtbaar is; instelbare straal, bevestiging vóór uitvoering, eenmaal per waargenomen bezoek, veilige GPS-marges en bescherming van actieve rit/timer. Beheer, swipe, ontbrekende koppelingen, tijdvakken over middernacht, opslagbehoud en shellintegratie gericht getest. Echte telefoon/GPS-controle volgt. |
| LOCATION-002 | Vertrek en achtergrondmeldingen | Nieuw | Locatieacties uitbreiden met vertrek en voorstellen wanneer Log gesloten is. | Buiten de eerste versie; mogelijkheden per platform onderzoeken. |
| BUG-004 | Oud versienummer overschrijft centrale badge | Geïmplementeerd | Zijmenu bleef test.106 tonen ondanks recent geladen app. | Test 0.33.2: versieschrijvers uit shell-location-status en shell-quick-actions verwijderd, inclusief callbacks bij klikken, pageshow en body-mutaties. Regressiecontrole controleert nu alle geladen hulpscripts op ongewenste versieschrijvers. |
| VERSION-001 | Eenvoudige doorlopende versiereeks | Geïmplementeerd | Gebruik 0.33.volgnummer tijdens testontwikkeling en verhoog bij een goedgekeurde livegang het middelste nummer. | Test 0.33.1 vervangt 0.31.10-test.124. Versielabel en asset/cacheversies gecontroleerd. Omgevingsbadge TEST blijft zichtbaar; live 0.33.0 en opslagcodes behouden. |
| PEOPLE-003 | Naam kopiëren en importuitleg instelbaar | Testen | Onder Instellingen → Personen twee onafhankelijke schakelaars voor Naam kopiëren en uitleg bij contactimport. | Test .124: beide standaard uit; kopieerknop gebruikt de opgeslagen of zojuist ingevulde naam. Klembord alleen na tik, met handmatige terugval bij weigering. Uitleg omvat plakken, vCard en op iOS de experimentele contactkiezer. Voorkeuren blijven bij tijdinstellingen in de bestaande back-up. Gerichte regressies geslaagd. |
| PEOPLE-002 | Eén telefooncontact overnemen | Testen | Contact kiezen waar ondersteund of .vcf importeren; koppelen aan een vaste Log-ID met gecontroleerd bijwerken. | Test .123: vCard 2.1/3.0/4.0, één contact per import, controlescherm met veldkeuze en meerdere nummers/e-mails. Overeenkomsten voorstellen; bron-UID apart bewaren indien aanwezig; herhaalde import behoudt identifier, profiel, historie, eigen notities en kleur. Geen automatische synchronisatie. Parser, browserkiezer, annuleren, opslagfouten en bestaande Personen-functies getest met synthetische gegevens; echte iPhone/Android-controle volgt. |
| PEOPLE-001 | Personen als eigen module | Testen | Collega-beheer uit instellingen verplaatsen naar Personen, met eigen gegevenskaart en bredere contacten. | Test .122: naam, relatie, organisatie, e-mail, telefoon, kleur en notitie; bestaande persoon hergebruiken als eigen profiel. Bestaande identifiers, QR-bronvelden, historie en timers behouden. Gedeelde swipeacties en archief/herstel; zoeken en moduleconfiguratie. Gerichte regressies en volledige shell in jsdom gecontroleerd; iPhone-PWA-controle volgt. |
| NAV-001 | Modulepositie instelbaar | Testen | Per module bepalen of deze zichtbaar is in de onderbalk, het zijmenu, beide of verborgen. | Schakelaars staan rechtstreeks in beide sorteerlijsten; opslag blijft achterwaarts compatibel. Release 0.31.10-test.85. |
| NAV-002 | Volgorde modules instelbaar | Testen | Volgorde van modules in onderbalk en zijmenu vanuit de moduleconfiguratie bepalen. | Beide lijsten behouden een eigen sleepvolgorde, ook voor uitgeschakelde modules. Release 0.31.10-test.85. |
| NAV-003 | Zijmenu half openen | Testen | Naast volledig geopend ook een gedeeltelijk geopend zijpaneel ondersteunen. | Menu opent in één stap op 50% van de schermbreedte (begrensd door de paneelbreedte); Instellingen staat als vaste menurij boven het versienummer. Release 0.31.10-test.87. |
| NAV-004 | Swipe tussen hoofdmodule en zijmenu | Testen | Van links naar rechts/rechts naar links kunnen vegen tussen hoofdmodule en zijpaneel. | Gebaar wisselt rechtstreeks tussen gesloten en halfopen; de tweede veeg naar volledig open is vervallen. Release 0.31.10-test.86. |
| NAV-005 | Scroll blokkeren achter geopend menu | Gepland | Bij geopend zijpaneel mag de hoofdmodule op de achtergrond niet scrollen. | Ook controleren als PWA op iPhone. |
| NAV-006 | Onderbalk geheel verbergen | Testen | De volledige onderbalk kunnen uitschakelen zonder modulekeuzes of volgorde te wissen. | Aparte hoofdschakelaar; minimaal één module blijft via een actieve navigatieroute bereikbaar. Release 0.31.10-test.85. |
| UI-001 | Zoeken als vergrootglas | Testen | Grote zoekweergave vervangen door een zoekicoon; zoekveld pas openen na aantikken. | In gesloten toestand reserveert de zoekbalk geen hoogte; de lege-resultaatmelding veroorzaakt geen observer-lus meer. Release 0.31.10-test.87. |
| UI-002 | Compacte titel bij scrollen | Testen | Grote moduletitel bij naar beneden scrollen transformeren naar compacte sticky header en terug vergroten bij terugscrollen. | Eén gedeelde iPhone-header met veilige bovenruimte, gecentreerde titel en gelijk uitgelijnde menu- en zoekknoppen. Release 0.31.10-test.99. |
| UI-003 | Kleuren bij items terugbrengen | Gepland | Kleuraccenten opnieuw toepassen bij relevante items en waarden. | Betekenisvol en consequent per type/thema/status. |
| UI-004 | Iconen bij adressen/locaties | Gepland | Locaties voorzien van herkenbare iconen en voorbereiden op meerdere locatietypen. | Hoofd- en sublocaties meenemen. |
| UI-005 | Uren leesbaar in periodeoverzicht | Testen | Totalen rustig en compact tonen zonder informatieverlies. | Tijd staat als `3u 30m`; minuten worden alleen getoond als ze aanwezig zijn. Release 0.31.10-test.90. |
| BUG-001 | GPS-punten zichtbaar in ritdetails | Testen | Het aantal opgeslagen GPS-punten van een rit weer als vast veld tonen in de uitgeklapte ritdetails, ook wanneer het aantal 0 is. | De bestaande GPS-telling blijft leidend; alleen de detailweergave is hersteld. Commits `04187fb` en `ece77a8`; gerichte controle op iPhone-PWA volgt. |
| BUG-002 | GPS-punten behouden na herstart | Testen | GPS-punten na hervatten of heropenen van de PWA gekoppeld houden aan hun rit. | `pageshow` gebruikt de veilige herlaadroute, zodat de uit IndexedDB geladen punten niet meer door de lege localStorage-fallback worden overschreven. Live 0.32.1 en test 0.31.10-test.106; regressietest toegevoegd. |
| RIDE-001 | Omrijpunt met één tik noteren | Testen | Tijdens een actieve rit met één tik op Omrijpunt het tijdstip en de locatie direct aan die rit koppelen, zonder formulier of extra bevestiging. | Test 0.31.10-test.107: dubbele tikken worden tijdens GPS-opvraag geblokkeerd; bij ontbrekende GPS wordt het punt zonder locatie bewaard. Gerichte regressiecontrole; iPhone-PWA-controle volgt. |
| RIDE-002 | Omrijpuntwachttijd en ritacties | Testen | Een omrijpunt maximaal eenmaal per 60 seconden vastleggen; een grote routeknop rechts in de actieve ritkaart met aantal tussenpunten en aflopende balk tonen. Navigatie, Tanken en Delen als subtielere knoppen met symbolen tonen. | Test 0.31.10-test.111: de tegel benut de vrije ruimte naast de route, toont de bestaande ritgebonden tussenpuntenteller en een route-icoon als SVG; wachttijd blijft na herstart gelden. Gerichte regressiecontrole geslaagd, iPhone-PWA-controle volgt. |
| BUG-003 | Testversie na update zichtbaar | Testen | Bij terugkeer naar de iPhone-PWA nieuwe releases oppakken en voorkomen dat de service worker bij installatie een oude browsercache bewaart. | Test 0.31.10-test.108: updatecontrole bij terugkeer; installatie en navigatie halen de pagina buiten de lokale HTTP-cache op. Controle op iPhone-PWA volgt. |
| LOC-001 | Hoofd- en sublocaties | Gepland | Sublocaties onder hoofdlocaties kunnen hangen. | Relatie moet ook bruikbaar zijn voor herkenning. |
| LOC-002 | Locatieherkenning hoofd + sub | Gepland | Bij locatieherkenning zowel hoofdlocatie als relevante sublocatie kunnen tonen. | Voorkom dubbelzinnige weergave. |
| LOC-003 | Locaties sorteren en ordenen | Testen | Locaties logisch, alfabetisch of in een eigen volgorde kunnen tonen zonder dat herkenningsstatus of volgorde verspringt bij openklappen. | Logisch gebruikt recent gebruik; Eigen toont sleephandvatten voor hoofdlocaties en verplaatst sublocaties als groep. Release 0.31.10-test.94. |
| FILTER-001 | Filter op thema's | Testen | Taken/tijdregistratie kunnen filteren op thema en subthema naast zoeken. | Het filter gebruikt rechtstreeks de actieve periode uit de tijdmodule en is losgekoppeld van de algemene DOM-observer; thema’s zonder tijd blijven buiten de keuzelijst. Gerichte regressietest toegevoegd. Release 0.31.10-test.98. |
| TIME-001 | Collega-inzet achteraf wijzigen | Testen | Bij een bestaande tijdregistratie personen en minuten per persoon kunnen aanpassen. | Persoonsverdeling, gebruiksteller en totale inzet worden opnieuw berekend zonder opslagmigratie. Release 0.31.10-test.88. |
| TIME-002 | Thema’s selectief meetellen | Testen | Per thema bepalen of registraties meetellen in de tijdtotalen. | Klokstatus per thema, Alles aan en Alles uit; uitgesloten tijden blijven zichtbaar maar zijn grijs, lichter en niet-vet. Release 0.31.10-test.95. |
| THEME-001 | Kleur per thema | Testen | Aan ieder thema een eigen kleur kunnen toekennen en die gebruiken bij Tijd/Taken. | De accentlijn toont de gekozen kleur; aanpassen blijft beschikbaar via Bewerk. Release 0.31.10-test.89. |
| THEME-002 | Thema’s sorteren en ordenen | Testen | Thema’s logisch, alfabetisch of in een eigen volgorde kunnen tonen. | Logisch gebruikt recentheid en gebruiksfrequentie; sleephandvatten zijn alleen zichtbaar bij Eigen volgorde. Release 0.31.10-test.92. |
| QUICK-001 | Snelle actie configureren | Gepland | Instellen welke actie direct bij openen van de app of module wordt gestart. | Generiek mechanisme voor toekomstige modules. |
| QUICK-002 | Snelle actie met bevestiging | Gepland | Vooraf ingevulde actie openen waarbij alleen nog bevestigen nodig is. | Bijvoorbeeld rit of tijdregistratie. |
| BAR-001 | Barcode/QR-code scannen | Testen | Camera of foto gebruiken om barcodes en QR-codes te lezen, inhoud controleren en opslaan. | Test .114: camera start direct; eigen frame-canvas wacht op geldige videoafmetingen en volgt dimensiewijzigingen. Onverwachte leesfouten geven een herstartoptie. QR/barcode-camera-overdracht naar formulier met synthetische beeldpixels getest; fysieke iPhone-controle volgt. |
| BAR-002 | Barcode/QR-code weergeven | Testen | Invoer omzetten naar QR-code of barcode, opslaan en groot weergeven. Iedere kaart heeft titel en kleur. | Test .113: QR, Code 128, EAN-13/8, UPC-A/E, Code 39, ITF en Codabar; exacte inhoud inclusief voorloopnullen, kopiëren en duplicaatcontrole. QR/Code128/EAN13 render-decode-roundtrip getest. |
| BAR-003 | Barcode koppelen aan gegevens | Testen | Kaarten koppelen aan hoofd- of sublocatie en snel terugvinden. Taak/thema/object blijven een vervolgstap. | Test .113: locatiefilter, zoeken en optionele GPS-sortering via In de buurt. Additief cards-veld in bestaande testopslag; volledige back-up en herstel behouden kaarten. |
| BAR-004 | Barcode als snelle startactie | Gepland | Instelbaar maken dat bij openen direct scanner of barcodeweergave wordt gestart. | Aansluiten op QUICK-001. |

## Besluiten en uitgangspunten

- Dit is één app met modules, geen verzameling losse apps.
- GitHub `main` is de bron van waarheid.
- De productieomgeving blijft ongemoeid zolang wijzigingen uitsluitend voor de testomgeving bedoeld zijn.
- Nieuwe functies moeten waar mogelijk generiek in de shell/moduleconfiguratie worden opgelost in plaats van per pagina hard gecodeerd.
- Bestaande gebruikersdata mag niet verloren gaan.
- Kleine, afzonderlijk testbare wijzigingen hebben voorkeur boven grote gecombineerde wijzigingen.
- Gebruik bij iedere wijziging een minimale, risicogestuurde testscope: gewijzigde functionaliteit + directe afhankelijkheden, niet standaard de gehele app.

## Wijzigingslog

| Datum | Wijziging |
|---|---|
| 2026-09-24 | BUG-003 hersteld in testrelease .116: shell-gestures en shell-direct-actions overschreven label én globale build met hardcoded .106. Beide dubbele versie-updaters/observers verwijderd; hoofdapp is enige bron, shell verzorgt weergave. Gerichte regressietest controleert alle geladen scripts op overschrijving en consistentie van badge/datumregel. |
| 2026-09-24 | BAR-002 verfijnd in testrelease .115: codetype en beheerknoppen uit geopende kaart verwijderd, inhoud/kopiëren onder gesloten uitklapregel. Kaartenlijst krijgt links-swipe voor bewerken/verwijderen met bevestiging en toegankelijke actiemenu-knop. Tests op swipe, verticale scroll, onbedoeld openen, bewerken en veilig verwijderen geslaagd; iPhone-gebaarcontrole volgt. |
| 2026-09-24 | BAR-001 reparatie in testrelease .114: videobeeld expliciet per frame uitlezen in plaats van een gecachet capture-canvas, wachten op bruikbare afmetingen, direct camerastart en zichtbare uitleg/herstart bij leesfouten. Regressie omvat QR en Code128 vanuit cameraframes naar formulier plus late dimensies en foutafhandeling. |
| 2026-09-24 | BAR-001/002/003 gebouwd in testrelease .113: Kaarten vervangt de dummy, met titel/kleur, invoer, QR/barcodegeneratie, camera/foto lezen, lokaal bewaren, kopiëren, bewerken, verwijderen en hoofd-/sublocatiekoppeling. Libraries lokaal meegeleverd voor offline gebruik; codes worden niet naar een encoder gestuurd. Gerichte tests op generatie/decoderen, filtering, opslagfouten, camera-lifecycle, legacy-data en complete back-up geslaagd. Visuele browsercontrole geblokkeerd door gebruikslimiet; iPhone-PWA-controle volgt. |
| 2026-09-23 | RIDE-002 compacter in testrelease .112: kop Actieve rit binnen de linkerkolom, tegel bovenaan uitgelijnd, wachttijd binnen de tegelhoogte en minder onderruimte bij ritacties. Gerichte regressiecontrole; visuele iPhone-controle volgt. |
| 2026-09-23 | RIDE-002 aangepast in testrelease .111: de grote Omrijpunt-tegel rechts naast de route in de actieve ritkaart geplaatst op basis van de aangeleverde schermindeling; de teller staat in de tegel, de dubbele teller is verwijderd en er is een getekend route-icoon toegevoegd. Opslag en wachttijd zijn niet gewijzigd. |
| 2026-09-23 | RIDE-002 visueel verfijnd voor testrelease .110: Omrijpunt uit de ritkaart gehaald en als losse neutrale actieregel onder de kaart geplaatst; subtiele voortgangslijn en resterende seconden staan onder de knop. De 60 seconden blokkering en opgeslagen gegevens blijven gelijk. |
| 2026-09-23 | RIDE-002 gebouwd in testrelease .109: prominente Omrijpunt-knop, 60 seconden blokkering met aftellende balk, subtiele ritacties met symbolen. Versielabel leest voortaan dezelfde buildwaarde als Ritten; daarnaast zijn verouderde fallbackwaarden van de shell bijgewerkt. |
| 2026-09-23 | BUG-003 toegevoegd: de testpagina leverde .107, maar een geopende iPhone-PWA kon de oude versie blijven tonen. In .108 controleert de app opnieuw bij terugkeer; de service worker laadt de pagina zonder oude HTTP-cache. |
| 2026-09-23 | RIDE-001 toegevoegd: omrijpunt tijdens een actieve rit direct met één tik opslaan zonder formulier; GPS of laatst bekende GPS-locatie gebruiken als beschikbaar, anders tijdstip zonder locatie bewaren. Alleen testomgeving, release 0.31.10-test.107. |
| 2026-09-22 | BUG-002 hersteld voor live 0.32.1 en test 0.31.10-test.106: bij `pageshow` blijft IndexedDB leidend, waardoor GPS-punten na hervatten of heropenen aan de juiste rit gekoppeld blijven. Een regressietest bewaakt het gemelde 4-naar-0-scenario in beide builds. |
| 2026-09-22 | Testrelease 0.31.10-test.104 is als productierelease 0.32.0 voorbereid. De productieversie gebruikt de bestaande productie-opslagsleutels voor ritten, tijd, identiteiten en GPS. Testrelease 0.31.10-test.105 scheidt daarnaast de resterende menu- en archiefopslag van live, zodat verdere tests geen productie-instellingen of archiefdata kunnen wijzigen. |
| 2026-09-22 | UI-002 gebouwd voor testrelease 0.31.10-test.99: conflicterende headerregels verwijderd; Ritten, Tijd/taken, Locaties en Thema’s gebruiken nu dezelfde sticky iPhone-header met safe-area, 44px-bediening en compacte scrolstatus. Een statische regressiecontrole bewaakt de belangrijkste layoutregels. |
| 2026-09-22 | Tijd/taken volgt bij een nieuwe registratie hetzelfde rustige patroon als Nieuwe rit: de inhoud van de bovenkaart wordt gedimd en de actieknop verdwijnt zolang het invoerblok openstaat. Testrelease 0.31.10-test.100. |
| 2026-09-22 | De bovenkaart van Tijd/taken is exact gelijkgetrokken met Nieuwe rit: tijdens invoer blijft één grijze tekstactie “Annuleer taak” zichtbaar, zonder blauwe knopachtergrond. Testrelease 0.31.10-test.101. |
| 2026-09-22 | Taakformulier compacter gemaakt: dubbele introductiekoppen en zichtbare Thema/Subthema-labels verwijderd, één kleine voorstelregel toegevoegd en de grijze annuleeractie tegen gedeelde knopstijlen afgeschermd. Testrelease 0.31.10-test.102. |
| 2026-09-22 | Thema en Subthema als losse veldkoppen boven de selecties geplaatst, annuleeractie volledig in de kaartachtergrond laten opgaan en de groene testachtergrond teruggezet naar de neutrale appachtergrond. Testrelease 0.31.10-test.103. |
| 2026-09-22 | Invoerstatus van Tijd/taken wordt nu direct toegepast: geen tijdelijke laag meer over de annuleeractie en het periodeblok met geboekte uren blijft verborgen zolang een nieuwe taak wordt aangemaakt. Testrelease 0.31.10-test.104. |
| 2026-09-22 | FILTER-001 structureel verbeterd voor testrelease 0.31.10-test.98: filteropties komen rechtstreeks uit de actieve periode van de tijdmodule, tijdmodulemutaties zijn losgekoppeld van de algemene layout-observer en een herhaalbare regressietest controleert kiezen, wissen en periodewisselen. Getest met het aangeleverde bestand: 8 registraties, 5 thema’s en 540 minuten in de actieve week. |
| 2026-09-21 | BUG-001 toegevoegd: GPS-punten terug als vast zichtbaar veld in uitgeklapte ritdetails; PWA-cache voor het betreffende UI-script ververst zonder opslag of andere modules te wijzigen. |
| 2026-09-21 | FILTER-001 aanvullend gecorrigeerd voor testrelease 0.31.10-test.97: themaselectie veroorzaakt geen terugkoppeling meer met de algemene layout-observer en herhaalde filterpasses wijzigen de DOM niet. |
| 2026-09-21 | FILTER-001 gecorrigeerd voor testrelease 0.31.10-test.96: thema’s zonder tijd verdwijnen uit het periodefilter en een observerlus bij de tijdsamenvatting is verholpen. |
| 2026-09-21 | FILTER-001 en TIME-002 uitgebreid voor testrelease 0.31.10-test.95: thematijden zichtbaar in het tijd-/takenfilter en alle thema’s in één keer aan of uit te zetten. |
| 2026-09-21 | LOC-003 gebouwd voor testrelease 0.31.10-test.94: locaties hebben Logisch, A–Z en Eigen volgorde; openklappen behoudt de GPS-status en sorteervolgorde, hoofd- en sublocaties blijven bij slepen één groep. Getest met het aangeleverde bestand met 24 locaties en 138 ritten. |
| 2026-09-21 | TIME-002 gecorrigeerd voor testrelease 0.31.10-test.93: de gedeelde accentkleur overschrijft de dimstatus niet meer; uitgesloten tijdwaarden zijn nu daadwerkelijk grijs en niet-vet. |
| 2026-09-21 | TIME-002 en THEME-002 uitgebreid voor testrelease 0.31.10-test.92: uitgesloten tijden volledig grijs/niet-vet en thema’s sorteerbaar als Logisch, A–Z of Eigen volgorde met slepen. |
| 2026-09-21 | TIME-002 verfijnd voor testrelease 0.31.10-test.91: uitgesloten tijden worden gedimd en de overbodige melding selectie actief is verwijderd. |
| 2026-09-21 | UI-005 en TIME-002 gebouwd voor testrelease 0.31.10-test.90: compacte tijdnotatie en per thema instelbare deelname aan tijdtotalen, inclusief Alles meetellen. |
| 2026-09-21 | THEME-001 verfijnd voor testrelease 0.31.10-test.89: het losse kleurbolletje is verwijderd; de accentlijn en kleurkeuze via Bewerk blijven behouden. |
| 2026-09-21 | TIME-001, THEME-001 en UI-005 gebouwd voor testrelease 0.31.10-test.88: collega-inzet bewerken, themakleuren en hele-urenweergave met kleine restminuten. |
| 2026-09-21 | UI-001 en NAV-003 gecorrigeerd voor testrelease 0.31.10-test.87: zoekruimte alleen tijdens zoeken, veilige nulresultaatstatus en zijmenu op 50% schermbreedte. |
| 2026-09-21 | NAV-003 en NAV-004 vereenvoudigd voor testrelease 0.31.10-test.86: direct halfopen en Instellingen als zichtbare menurij. |
| 2026-09-21 | NAV-001, NAV-002 en NAV-006 gebouwd voor testrelease 0.31.10-test.85; gerichte controle en testomgeving volgen. |
| 2026-09-21 | Werkwijze aangescherpt: alleen relevante informatie, bestanden en controles doorlopen en risicogestuurd testen in plaats van standaard de volledige app. |
| 2026-09-21 | Backlog aangemaakt en huidige navigatie-, UI-, locatie-, filter-, quick-action- en barcodewensen opgenomen. |

| 2026-09-24 | Testrelease .117: uniforme swipevolgorde (kort bewerken, verder archiveren/verwijderen), gedeelde actieopmaak en minimale regelhoogte in alle modules inclusief kaarten en subthema’s. Algemene instelling schakelt lifecycle-acties uit, ook in open editors; bestaande modulebeperkingen blijven gelden. Codetype verborgen in kaartenlijst. Moduleoverstijgende regressie en kaartcontroles toegevoegd. |

| 2026-09-24 | Testrelease .118: kleur-overschrijvingen bij ritten verwijderd; ondoorzichtige swipe-acties geven gelijke kleuren op verschillende achtergronden. Tijd/Taken heeft een bedienbare, meedraaiende detailchevron. Kaarten openen via kaartsymbool; puntjesknop verwijderd. Gerichte detail- en kaartregressies uitgevoerd. |

| 2026-09-24 | Testrelease .119: scanherkenning opent bestaande kaart op exacte inhoud; meerdere matches geven keuze, onbekende code gaat naar invoer. Per kaart een voorkeursactie (locatie openen of taak starten met thema/subthema); taakstart vereist aantikken en controleert actuele timer, ontbrekende koppelingen en opslagfouten. Bestaande kaarten/backup blijven behouden; scanAction is optioneel. |

| 2026-09-25 | Testrelease .120: draagbare Log-QR v1 maken/lezen met thema, subthema, locatie/sublocatie en persoon. Importpreview met nieuwe/bestaande/afwijkende gegevens; vaste bronidentifiers blijven behouden bij locatiebewerking. Personen in collega-beheer; taakstarter en ritvoorbereiding na bevestiging. Herhaalde scans idempotent, gegevens en actieve registraties behouden. Meertrapsprocedures blijven vervolgwerk. |

| 2026-09-25 | Testrelease .121: ook routes onder 1 km gebruiken afstand × routefactor. Zonder bruikbare historie standaardfactor 1,3 (schatting). Onafgeronde geschatte start/eindstand blijft afzonderlijk bewaard, inclusief herstart en heractiveren; handmatige correcties resetten het verschil. Korte geschatte ritten gebruiken hun onafgeronde afstand voor routehistorie, niet voor het leren van de factor. Dashboardstanden en rapportagetotalen blijven leidend. Gerichte regressie test 0,5 + 0,5 km, legacy 0 km, opslag/hervatten en correcties. |

# Controle acties en sublocaties — 27 september 2026

- 0.33.15 (28 september): gedeelde GPS-opvraag bij openen/hervatten, vervolgens 6 seconden zonder actieve rit en 60 seconden met actieve rit. Geen periodieke aanvragen op achtergrond; gelijktijdige aanvragen delen één verzoek. Acties, ritopslag en locatieoverzicht ontvangen dezelfde meting. Ritspoor bewaart maximaal één vers punt per minuut; oude GPS wordt niet opnieuw als actuele positie opgeslagen. Bestaande punten/IndexedDB en sleutels behouden. Handmatige GPS-acties kunnen een extra meting vragen. Gerichte interval-, achtergrond/hervat-, fout-, spoor- en actieovergangstests geslaagd.

- 0.33.14: verwijderen/archiveren centraal onder Bediening: één hoofdschakelaar plus uitklapbare keuzes voor zeven modules. Losse bediening bij Ritten/Tijd en taken/Locaties verwijderd. Optionele settings.swipeLifecycleModules in bestaande kilometeropslag; bij ontbrekende keuze blijven oude vlaggen leidend. Hoofdschakelaar wist geen modulekeuzes. Legacy vlaggen en gebruikersdata blijven bewaard; alle relevante uitvoer- en editorcontroles gebruiken dezelfde policy. Gerichte module-swipe- en centrale instellingtests geslaagd.

- 0.33.13: direct pauzeren/hervatten van acties (geen onmiddellijke uitvoering bij hervatten); Log-QR inhoudsvoorbeeld met terugkeer naar behouden invoer vóór kaartaanmaak; samenvatting van actieve type-/locatie-/zoekfilters en één wisknop. Gerichte actie-UI/overgangs-, Log-code- en filtercontroles geslaagd. Geen nieuwe opslagsleutels; productie ongewijzigd.

- 0.33.12: compacte actiestatussen en detailweergave via aantikken. Details tonen reden, GPS-herkenning/nauwkeurigheid, straal, dagen, tijdvak, volgende mogelijkheid en laatste weergave/voorbereiding binnen de huidige sessie (geen nieuwe opslagsleutels). Swipe-bewerken/reset behouden. Detailvenster beschermt tegen automatisch openen van een andere actie. Actie-UI, overgangs- en herhaalcontroles geslaagd.

- Versiebeleid gewijzigd op verzoek: zichtbare testversie 0.33.11; cache kmreg-test-shell-0.33.11 zonder aparte r-suffix. Hoofdapp, assetreferenties en shell-fallbacks lopen gelijk. Volgende updates verhogen het applicatienummer. Productie ongemoeid; versielabelcontrole geslaagd (ongewijzigde vendorbestanden buiten controle).

- Log-QR aanmaak (r9): alleen relevante nieuwe invoervelden, subthema afhankelijk van hoofdthema, starters afhankelijk van thema/locatie, contextafhankelijke uitleg. Verborgen invoer uitgeschakeld en niet meegenomen; irrelevante starters gewist. Gerichte Log-code-regressie inclusief aanmaak/import/starters geslaagd. Versie en opslag ongewijzigd.

- Aanpassing reset (r8): bij een ingestelde wachttijd start swipe-reset de volledige termijn opnieuw. Verplaatsen is niet nodig; afloop telt als verandering. Geen directe uitvoering bij reset. Locatie/dagen/tijdvak blijven vereist. Dit vervangt voor tijdgestuurde acties de eerdere resetdefinitie hieronder; overige herhaalmodi behouden hun bestaande werking. Gerichte herhaal- en overgangstests bijgewerkt.

- Typefilter toegevoegd bij Acties: alle typen, ritten, taken en kaarten. Combineert met locatiefilter en bestaande zoekselectie; selectie blijft bij opnieuw renderen behouden. Lege selectie geeft één melding. Gerichte DOM-controle geslaagd. Cache r7; versie 0.33.10 behouden.

- Statusverduidelijking (cache r6): vóór eerste uitvoering en na swipe-reset blijft de ingestelde herhaaltermijn zichtbaar, naast de vereiste aankomst/tijdvakovergang. Een verstreken wachttijd wordt expliciet benoemd. Geen wijziging aan uitvoerlogica of opslag; action-repeat, action-transitions en action-state-review slagen.

- Afgerond (alleen test, applicatieversie 0.33.10): sublocaties slaan geen eigen adres of automatisch afgeleide GPS op; expliciet ingevulde GPS blijft behouden. Late geocode-antwoorden na omschakelen naar sublocatie worden genegeerd.
- Afgerond: actiefilter toont hoofdlocatie en bijbehorende sublocaties; bij selectie van een sublocatie ook hoofdlocatie-acties, geen zustersublocaties.
- Afgerond: wachtvoorwaarden houden ready=false; niet-startbare taken en mislukte bevestigingen krijgen geen succesvolle herhaalstatus. Handmatig kaartopenen blijft onafhankelijk. Mislukte slimme ritvoorbereiding wordt niet als afgehandeld opgeslagen.
- Gecontroleerd: reset binnen/buiten, bevestigde aankomst, swipe/touch/cancel, tijdvakken, ingestelde wachttijd, dagwisseling, locatiewisseling, foutafhandeling, opslag en gedeeld klembordicoon. VISITS en EDGES bewust behouden.
- Herhaaldefinitie: aankomst of begin toegestaan tijdvak activeert; expliciet gekozen wachttijd/dagmodus telt het verstrijken als verandering bij geldige locatie/tijd. Reset verwijdert deze termijn en wacht opnieuw op aankomst/tijdvak. Vertrek alleen triggert geen locatieactie; wel het afzonderlijke slimme ritvoorstel.
- Gerichte regressies: action-transitions, action-repeat, action-task, action-ui, location-actions, action-state-review, sublocation-review. Fysieke GPS/iPhone-praktijkcontrole nog open.
- Cache: kmreg-test-shell-0.33.10-r5. Geen productiebestanden of opslagsleutels gewijzigd.

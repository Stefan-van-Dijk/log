# Log — Ontwikkelbacklog

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

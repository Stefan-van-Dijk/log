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
| BAR-001 | Barcode/QR-code scannen | Gepland | Camera gebruiken om barcodes en QR-codes te lezen. | Resultaat als generieke waarde beschikbaar maken. |
| BAR-002 | Barcode/QR-code weergeven | Gepland | Opgeslagen waarde als barcode/QR-code op het scherm kunnen weergeven. | Bruikbaar voor snelle actie en identificatie. |
| BAR-003 | Barcode koppelen aan gegevens | Gepland | Barcode koppelen aan locatie, taak, thema, object of toekomstige moduledata. | Koppeling generiek houden. |
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
| 2026-09-22 | UI-002 gebouwd voor testrelease 0.31.10-test.99: conflicterende headerregels verwijderd; Ritten, Tijd/taken, Locaties en Thema’s gebruiken nu dezelfde sticky iPhone-header met safe-area, 44px-bediening en compacte scrolstatus. Een statische regressiecontrole bewaakt de belangrijkste layoutregels. |
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

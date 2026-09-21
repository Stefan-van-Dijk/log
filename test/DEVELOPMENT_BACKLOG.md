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
| NAV-001 | Modulepositie instelbaar | Gepland | Per module bepalen of deze zichtbaar is in de onderbalk, het zijmenu, beide of verborgen. | Configuratiegestuurd houden. |
| NAV-002 | Volgorde modules instelbaar | Gepland | Volgorde van modules in onderbalk en zijmenu vanuit de moduleconfiguratie bepalen. | Gebruik drag/sleephandvat waar dit in de UI wordt beheerd. |
| NAV-003 | Zijmenu half openen | Gepland | Naast volledig geopend ook een gedeeltelijk geopend zijpaneel ondersteunen. | Hoofdmodule mag deels zichtbaar blijven. |
| NAV-004 | Swipe tussen hoofdmodule en zijmenu | Gepland | Van links naar rechts/rechts naar links kunnen vegen tussen hoofdmodule en zijpaneel. | Geen onnodige 44px-startzone als gebaren niet conflicteren. |
| NAV-005 | Scroll blokkeren achter geopend menu | Gepland | Bij geopend zijpaneel mag de hoofdmodule op de achtergrond niet scrollen. | Ook controleren als PWA op iPhone. |
| UI-001 | Zoeken als vergrootglas | Gepland | Grote zoekweergave vervangen door een zoekicoon; zoekveld pas openen na aantikken. | Generiek gedrag in shell waar mogelijk. |
| UI-002 | Compacte titel bij scrollen | Gepland | Grote moduletitel bij naar beneden scrollen transformeren naar compacte sticky header en terug vergroten bij terugscrollen. | iOS-achtig, vloeiende overgang. |
| UI-003 | Kleuren bij items terugbrengen | Gepland | Kleuraccenten opnieuw toepassen bij relevante items en waarden. | Betekenisvol en consequent per type/thema/status. |
| UI-004 | Iconen bij adressen/locaties | Gepland | Locaties voorzien van herkenbare iconen en voorbereiden op meerdere locatietypen. | Hoofd- en sublocaties meenemen. |
| LOC-001 | Hoofd- en sublocaties | Gepland | Sublocaties onder hoofdlocaties kunnen hangen. | Relatie moet ook bruikbaar zijn voor herkenning. |
| LOC-002 | Locatieherkenning hoofd + sub | Gepland | Bij locatieherkenning zowel hoofdlocatie als relevante sublocatie kunnen tonen. | Voorkom dubbelzinnige weergave. |
| FILTER-001 | Filter op thema's | Gepland | Taken/tijdregistratie kunnen filteren op thema en subthema naast zoeken. | Filtergedrag consistent met module-opbouw. |
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
| 2026-09-21 | Werkwijze aangescherpt: alleen relevante informatie, bestanden en controles doorlopen en risicogestuurd testen in plaats van standaard de volledige app. |
| 2026-09-21 | Backlog aangemaakt en huidige navigatie-, UI-, locatie-, filter-, quick-action- en barcodewensen opgenomen. |

# Log Top Block — modulair bovenblok

Dit document beschrijft het gedeelde frame voor de bovenkant van Log-modules. Het doel is dat modules niet langer ieder hun eigen bovenkaart opbouwen en daarna met losse CSS gelijkgetrokken worden. De module levert alleen inhoud en status; het framework bepaalt maatvoering, typografie en onderlinge afstanden.

## Basisprincipe

Een bovenblok bestaat uit vaste, optionele slots:

1. `frame` — verdeelt identiteit en context wanneer een rechterdeel nodig is.
2. `identity` — hoofdinhoud van het blok.
3. `icon` — optioneel module- of typepictogram.
4. `kicker` — klein bovenlabel, bijvoorbeeld `Actieve rit` of `Waarschijnlijk nu`.
5. `title` — primaire titel of waarde.
6. `subtitle` — één ondersteunende regel.
7. `meta` — compacte metadata onder de titel.
8. `status` — statusindicator binnen metadata.
9. `primary-value` — grote actuele waarde, bijvoorbeeld een lopende tijd.
10. `side` — optionele context-/actiezone rechts.
11. `primary-action` — één primaire actie over de volle breedte.
12. `secondary-actions` — rustige secundaire acties onder de primaire actie.

Niet ieder blok hoeft ieder slot te gebruiken. Ontbrekende slots nemen geen ruimte in.

## Varianten

- `idle` — klaar voor een nieuwe registratie of actie.
- `active` — actieve rit, taak of andere lopende activiteit.
- `pending` — activiteit is gestopt maar moet nog worden afgerond.
- `preparing` — gebruiker is een nieuwe of afrondende handeling aan het voorbereiden.

De variant verandert de inhoud en beperkte statusweergave, niet de basismaatvoering.

## Huidige toepassing

`shared-home-components.js` sluit de bestaande bovenblokken van **Ritten** en **Tijd/Taken** op dit slotmodel aan. Daardoor gebruiken beide modules dezelfde CSS uit `shared-home-components.css` zonder dat hun bestaande eventhandlers of opslagmodel gewijzigd hoeven te worden.

Daarnaast normaliseert dezelfde adapter de periodekop. Beide modules hebben daardoor dezelfde DOM-opbouw voor de periodetitel:

```text
period-center
 ├─ period-title-line
 │   ├─ strong
 │   └─ period-scale-button
 └─ small
```

Het pijltje voor periodegrootte is dus in beide modules een echte knop en niet meer in één module een CSS-`::after`.

Nieuwe modules kunnen het framework rechtstreeks gebruiken via:

```js
window.LogTopBlock.render({
  module: 'cards',
  variant: 'idle',
  kicker: 'Kaart',
  title: 'Projectkaart KIP',
  subtitle: 'Gedeelde kaart',
  status: 'Update beschikbaar',
  meta: ['KIP', 'Publiek'],
  primaryActionHtml: '<button class="btn primary">Open kaart</button>'
});
```

Bestaande DOM kan zonder opnieuw renderen aan het framework worden gekoppeld met `window.LogTopBlock.adopt(...)`.

## Vormtokens

De vaste vorm komt uit CSS-variabelen met prefix `--log-top-`:

- buitenpadding: 16 px;
- rasterafstand: 12 px;
- hoekradius: 16 px;
- titel: maximaal 30 px;
- subtitel: 14 px;
- metadata: 12 px;
- primaire actie: 50 px hoog;
- secundaire actie: 40 px hoog;
- rechter contextslot: minimaal 166 px hoog.

Voor smalle schermen wordt alleen de schaal beperkt aangepast; de slotvolgorde en verhoudingen blijven gelijk.

## CSS-eigenaarschap

De homepagina heeft vanaf deze opzet drie duidelijke lagen:

1. `shared-home-components.css` — volledige geometrie en typografie van het bovenblok.
2. `shared-page-template.css` — periodekop, vorige/volgende bediening, periodekeuzechevron, samenvatting, sectietitel, datumgroepen en lege lijst.
3. Module-CSS — uitsluitend inhoud en interactie die niet generiek is, bijvoorbeeld kilometerstand, routepunten, tijdnotatie, taakvelden, swipe-acties en instellingen.

Voor **Tijd/Taken** bevat `time/home-top.css` daarom alleen nog de modulekop. `time/home-layout.css` bevat alleen nog invoerpanelen en tijdspecifieke interactie. De eerdere eigen styling voor `.home-action`, `.period-overview`, `.period-summary` en de CSS-chevron is daar verwijderd.

Ritten bevat nog historische basisregels in `index.html`; binnen de gemarkeerde gedeelde homecomponenten zijn die niet meer leidend. De gedeelde selectors zijn daar de eigenaar van de uiteindelijke maatvoering. Deze legacyregels kunnen later fysiek uit `index.html` worden gehaald nadat de gedeelde opzet op de testtelefoon is bevestigd.

## Ontwerpregels

- Een module mag geen eigen titelgrootte, kaartpadding of primaire knophoogte meer bepalen voor dit bovenblok.
- Een module mag geen eigen geometrie voor de periodekop of samenvattingskaart bepalen.
- Nieuwe informatie wordt in een bestaand slot geplaatst voordat een nieuw type slot wordt toegevoegd.
- Status is informatie, geen aparte layoutvariant.
- Eén primaire actie per bovenblok. Aanvullende acties horen in `secondary-actions`.
- Het framework bevat geen modulespecifieke opslag- of businesslogica.
- `shared-page-template.css` regelt uitsluitend het ritme ná het bovenblok en de gedeelde periode-/lijstcomponenten.

## Uitbreiding

Kaarten, Locaties, Acties en Codes kunnen later op hetzelfde contract worden aangesloten. Daarvoor hoeft de basis-CSS niet opnieuw ontworpen te worden; alleen de inhoud per slot en eventueel het modulepictogram verschillen.

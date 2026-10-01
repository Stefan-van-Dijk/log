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

## Ontwerpregels

- Een module mag geen eigen titelgrootte, kaartpadding of primaire knophoogte meer bepalen voor dit bovenblok.
- Nieuwe informatie wordt in een bestaand slot geplaatst voordat een nieuw type slot wordt toegevoegd.
- Status is informatie, geen aparte layoutvariant.
- Eén primaire actie per bovenblok. Aanvullende acties horen in `secondary-actions`.
- Het framework bevat geen modulespecifieke opslag- of businesslogica.
- `shared-page-template.css` regelt alleen het ritme ná het bovenblok: periode, samenvatting en lijsten.

## Uitbreiding

Kaarten, Locaties, Acties en Codes kunnen later op hetzelfde contract worden aangesloten. Daarvoor hoeft de basis-CSS niet opnieuw ontworpen te worden; alleen de inhoud per slot en eventueel het modulepictogram verschillen.

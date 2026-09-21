# Menuconfiguratie van Log

Het bestand `modules.json` is de centrale bron voor het zijmenu, de iOS-onderbalk en de lijst **Onderdelen en volgorde** in Instellingen.

## Werking

1. Log leest bij het starten `modules.json`.
2. Alleen geldige en beschikbare modules worden opgenomen.
3. Persoonlijke keuzes voor positie en volgorde worden lokaal per apparaat toegepast.
4. Een module kan in de onderbalk, het menu, beide of nergens zichtbaar zijn.
5. De onderbalk en het menu hebben ieder een eigen volgorde. De standaardvolgorde komt uit dit document.
6. Tot en met vijf gekozen onderdelen staan rechtstreeks in de onderbalk; bij meer onderdelen toont de balk vier onderdelen en **Meer**.
7. Bij een onbereikbare bron gebruikt Log de laatst geldige opgeslagen versie.
8. Als ook die ontbreekt, gebruikt Log de ingebouwde veilige standaardconfiguratie.

## Velden per module

| Veld | Betekenis |
|---|---|
| `id` | Vaste technische variabele. Nooit wijzigen nadat een module in gebruik is. |
| `label` | Volledige zichtbare naam in het zijmenu en als paginatitel. |
| `shortLabel` | Korte naam voor de onderbalk. |
| `subtitle` | Korte toelichting in Instellingen. |
| `icon` | Een ondersteund pictogram: `rides`, `time`, `locations`, `themes` of `barcodes`. |
| `available` | `false` verwijdert het onderdeel uit menu én instellingen. |
| `defaultPlacement` | Standaardpositie: `bottom`, `menu`, `both` of `hidden`. |
| `bottomOrder` | Standaardvolgorde in de onderbalk; lagere waarden staan eerder. |
| `menuOrder` | Standaardvolgorde in het zijmenu; lagere waarden staan eerder. |
| `view` | Gekoppelde weergave: `rides`, `time`, `locations` of `placeholder`. |
| `settingsTarget` | Gekoppelde instellingengroep of `null`. |

## Nieuwe onderdelen

Een nieuw onderdeel kan veilig als placeholder worden toegevoegd met:

```json
{
  "id": "nieuw_onderdeel",
  "label": "Nieuw onderdeel",
  "shortLabel": "Nieuw",
  "subtitle": "Beschrijving van het nieuwe onderdeel",
  "icon": "themes",
  "available": true,
  "defaultPlacement": "hidden",
  "bottomOrder": 60,
  "menuOrder": 60,
  "view": "placeholder",
  "settingsTarget": null
}
```

Gebruik voor een volledig werkende nieuwe module pas een andere `view` nadat die weergave in Log is gebouwd. Het schema `modules.schema.json` beschrijft de toegestane structuur formeel.

## Belangrijke afspraken

- Gebruik `id` als koppelsleutel; koppel nooit op de zichtbare naam.
- Verwijder een gebruikte `id` alleen bewust. Lokale voorkeuren blijven anders wel bewaard, maar worden niet weergegeven.
- Plaats geen HTML of JavaScript in de configuratie. Log accepteert alleen tekst en bekende weergavetypen.
- Wijzig `schemaVersion` alleen bij een bewuste wijziging van de structuur.
